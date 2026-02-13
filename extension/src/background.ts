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
    url = `${searchUrl}${separator}p%5B%5D=facets.price_range.from%3DMin%26facets.price_range.to%3D${price}`;
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
  const { url, remainingFilters } = applyPriceToUrl(
    search_url,
    filters,
    platform,
  );

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
    for (let i = 0; i < remainingFilters.length; i++) {
      const filter = remainingFilters[i];
      try {
        const result = await sendToContentScript(tabId, {
          type: "APPLY_ONE_FILTER",
          filter,
        });
        if (
          (result as { success?: boolean })?.success &&
          i < remainingFilters.length - 1
        ) {
          await waitForTabLoad(tabId);
          await sleep(2000);
        }
      } catch {
        // Filter failed, continue with next
      }
    }

    // Wait for final page to settle after last filter
    if (remainingFilters.length > 0) {
      await sleep(1500);
    }

    // Extract products
    const response = await sendToContentScript(tabId, {
      type: "EXTRACT_PRODUCTS",
      count: 10,
    });

    return (response as { products: Product[] })?.products || [];
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

    const platformResults = await Promise.allSettled(
      data.platforms.map((pi: PlatformIntent) =>
        processPlatformInHiddenTab(pi),
      ),
    );

    // Collect all products from successful platforms
    const allProducts: Product[] = [];
    for (const result of platformResults) {
      if (result.status === "fulfilled") {
        allProducts.push(...result.value);
      }
    }

    if (allProducts.length === 0) {
      sendToSidePanel({
        type: "ERROR",
        message:
          "Could not find products on either platform. Try a different search.",
      });
      return;
    }

    // Step 3: Rank products
    sendToSidePanel({
      type: "STATUS",
      message: `Found ${allProducts.length} products. Picking the best ones...`,
    });

    let rankedProducts: Product[];

    if (allProducts.length <= 5) {
      rankedProducts = allProducts;
    } else {
      try {
        const rankResponse = await fetch(`${BACKEND_URL}/api/rank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: data.raw_query,
            products: allProducts,
          }),
        });

        if (rankResponse.ok) {
          const rankData = await rankResponse.json();
          rankedProducts = rankData.ranked_products;
        } else {
          rankedProducts = fallbackSort(allProducts).slice(0, 5);
        }
      } catch {
        rankedProducts = fallbackSort(allProducts).slice(0, 5);
      }
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
