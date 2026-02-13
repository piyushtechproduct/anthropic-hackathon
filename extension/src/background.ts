import type { Filter, Product, PlatformIntent } from "./types";

const BACKEND_URL = "http://localhost:8000";

function extractPriceNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function applyPriceToUrl(
  searchUrl: string,
  filters: Filter[],
  platform: string,
): { url: string; remainingFilters: Filter[]; appliedPrice: Filter | null } {
  const priceFilter = filters.find((f) => f.type === "price");
  if (!priceFilter) {
    return { url: searchUrl, remainingFilters: filters, appliedPrice: null };
  }

  const price = extractPriceNumber(priceFilter.value);
  if (price === null) {
    return { url: searchUrl, remainingFilters: filters, appliedPrice: null };
  }

  let url: string;
  if (platform === "amazon") {
    const paise = price * 100;
    const separator = searchUrl.includes("?") ? "&" : "?";
    url = `${searchUrl}${separator}rh=p_36%3A-${paise}`;
  } else if (platform === "flipkart") {
    const separator = searchUrl.includes("?") ? "&" : "?";
    url = `${searchUrl}${separator}p%5B%5D=facets.price_range.from%3DMin&p%5B%5D=facets.price_range.to%3D${price}`;
  } else {
    return { url: searchUrl, remainingFilters: filters, appliedPrice: null };
  }

  const remainingFilters = filters.filter((f) => f.type !== "price");
  return { url, remainingFilters, appliedPrice: priceFilter };
}

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId! });
});

const FLOW_TIMEOUT_MS = 45_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SEARCH_REQUEST") {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), FLOW_TIMEOUT_MS),
    );
    Promise.race([handleSearchRequest(message.prompt), timeout]).catch(
      (err) => {
        if (err instanceof Error && err.message === "TIMEOUT") {
          sendToSidePanel({
            type: "ERROR",
            message:
              "This is taking too long. The backend might be overloaded — please try again.",
          });
        }
      },
    );
    sendResponse({ received: true });
  }
  return true;
});

// --- Core: process a single platform in a hidden background tab ---

async function processPlatformInHiddenTab(
  platformIntent: PlatformIntent,
): Promise<Product[]> {
  const { platform, search_url, filters } = platformIntent;
  const { url, remainingFilters, appliedPrice } = applyPriceToUrl(
    search_url,
    filters,
    platform,
  );

  const maxPrice = appliedPrice ? extractPriceNumber(appliedPrice.value) : null;

  // Open hidden background tab
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id!;

  try {
    // Wait for page load
    await waitForTabLoad(tabId);
    await sleep(2500);

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await sleep(500);

    // Apply remaining filters one-by-one
    for (const filter of remainingFilters) {
      try {
        const result = await sendToContentScript(tabId, {
          type: "APPLY_ONE_FILTER",
          filter,
        });
        if ((result as { success?: boolean })?.success) {
          // Filter click may have caused a full-page navigation — wait and re-inject
          await waitForPossibleNavigation(tabId);
          await injectContentScript(tabId);
        }
      } catch {
        // Content script might be gone after navigation; re-inject and continue
        await waitForPossibleNavigation(tabId);
        await injectContentScript(tabId);
      }
    }

    // Safety-net re-inject before extraction
    await injectContentScript(tabId);

    // Extract products
    const response = await sendToContentScript(tabId, {
      type: "EXTRACT_PRODUCTS",
      count: 10,
    });

    let products = (response as { products: Product[] })?.products || [];

    // Enforce price constraint client-side (URL param can be lost after filter navigation)
    if (maxPrice !== null) {
      products = products.filter((p) => p.price <= maxPrice);
    }

    return products;
  } finally {
    // Always close the hidden tab
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab might already be closed
    }
  }
}

// --- Main search handler ---

async function handleSearchRequest(prompt: string) {
  try {
    sendToSidePanel({
      type: "STATUS",
      message: "Understanding your request...",
    });

    // Step 1: Call multi-platform intent API
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/intent/multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    } catch {
      sendToSidePanel({
        type: "ERROR",
        message:
          "Backend server is not running. Start it with: cd backend && uv run uvicorn src.app.main:app --reload",
      });
      return;
    }

    if (!response.ok) {
      sendToSidePanel({
        type: "ERROR",
        message:
          "Something went wrong understanding your request. Please try rephrasing.",
      });
      return;
    }

    const data = await response.json();

    // Step 2: Search both platforms in parallel using hidden tabs
    sendToSidePanel({
      type: "STATUS",
      message: `Searching Amazon & Flipkart for "${data.raw_query}"...`,
    });

    const platforms: PlatformIntent[] = data.platforms;
    const platformResults = await Promise.allSettled(
      platforms.map((pi) => processPlatformInHiddenTab(pi)),
    );

    // Separate products by platform
    const amazonProducts: Product[] = [];
    const flipkartProducts: Product[] = [];
    for (let i = 0; i < platforms.length; i++) {
      const result = platformResults[i];
      if (result.status === "fulfilled") {
        const name = platforms[i].platform;
        if (name === "amazon") {
          amazonProducts.push(...result.value);
        } else if (name === "flipkart") {
          flipkartProducts.push(...result.value);
        }
      }
    }

    const totalFound = amazonProducts.length + flipkartProducts.length;
    if (totalFound === 0) {
      sendToSidePanel({
        type: "ERROR",
        message:
          "Could not find products on either platform. Try a different search.",
      });
      return;
    }

    // Step 3: Pick top 3 per platform, interleave Amazon/Flipkart
    sendToSidePanel({
      type: "STATUS",
      message: `Found ${totalFound} products. Picking the best ones...`,
    });

    const TARGET_PER_PLATFORM = 3;
    const TOTAL_TARGET = 6;
    const sortedAmazon = fallbackSort(amazonProducts);
    const sortedFlipkart = fallbackSort(flipkartProducts);

    // Each platform gets up to 3; if one has fewer, the other fills the gap
    let amazonSlots = Math.min(sortedAmazon.length, TARGET_PER_PLATFORM);
    let flipkartSlots = Math.min(sortedFlipkart.length, TARGET_PER_PLATFORM);
    const remaining = TOTAL_TARGET - amazonSlots - flipkartSlots;
    if (remaining > 0) {
      // Fill from whichever platform has surplus
      const amazonExtra = Math.min(
        sortedAmazon.length - amazonSlots,
        remaining,
      );
      amazonSlots += amazonExtra;
      flipkartSlots += Math.min(
        sortedFlipkart.length - flipkartSlots,
        remaining - amazonExtra,
      );
    }

    const topAmazon = sortedAmazon.slice(0, amazonSlots);
    const topFlipkart = sortedFlipkart.slice(0, flipkartSlots);

    // Interleave: Amazon first, then Flipkart, alternating
    const rankedProducts: Product[] = [];
    const maxLen = Math.max(topAmazon.length, topFlipkart.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < topAmazon.length) rankedProducts.push(topAmazon[i]);
      if (i < topFlipkart.length) rankedProducts.push(topFlipkart[i]);
    }

    // Step 4: Send products to side panel
    sendToSidePanel({
      type: "PRODUCTS",
      products: rankedProducts,
      query: data.raw_query,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred";
    sendToSidePanel({
      type: "ERROR",
      message: `Something went wrong: ${message}`,
    });
  }
}

// Deterministic fallback: score = (rating * log(reviews + 1)) / price
function fallbackSort(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const scoreA = computeScore(a);
    const scoreB = computeScore(b);
    return scoreB - scoreA;
  });
}

function computeScore(p: Product): number {
  const r = p.rating ?? 0;
  const rc = p.review_count ?? 0;
  if (p.price <= 0) return 0;
  return (r * Math.log(rc + 1)) / p.price;
}

// --- Helpers ---

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await sleep(500);
  } catch {
    // Tab may have been closed or is not injectable
  }
}

async function waitForPossibleNavigation(tabId: number): Promise<void> {
  // Brief pause so any navigation triggered by a click can start
  await sleep(1000);
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== "complete") {
      await waitForTabLoad(tabId);
    }
  } catch {
    // Tab may be gone
  }
  // Let the page settle after load
  await sleep(1500);
}

async function sendToContentScript(
  tabId: number,
  message: unknown,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

function sendToSidePanel(message: unknown) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be listening yet — safe to ignore
  });
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
