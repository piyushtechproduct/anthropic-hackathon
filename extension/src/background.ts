const BACKEND_URL = "http://localhost:8000";

interface Filter {
  type: string;
  value: string;
}

function extractPriceNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function applyPriceToUrl(
  searchUrl: string,
  filters: Filter[],
): { url: string; remainingFilters: Filter[]; appliedPrice: Filter | null } {
  const priceFilter = filters.find((f) => f.type === "price");
  if (!priceFilter) {
    return { url: searchUrl, remainingFilters: filters, appliedPrice: null };
  }

  const price = extractPriceNumber(priceFilter.value);
  if (price === null) {
    return { url: searchUrl, remainingFilters: filters, appliedPrice: null };
  }

  const paise = price * 100;
  const separator = searchUrl.includes("?") ? "&" : "?";
  const url = `${searchUrl}${separator}rh=p_36%3A-${paise}`;
  const remainingFilters = filters.filter((f) => f.type !== "price");

  return { url, remainingFilters, appliedPrice: priceFilter };
}

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId! });
});

const FLOW_TIMEOUT_MS = 30_000;

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

async function handleSearchRequest(prompt: string) {
  try {
    // Step 1: Tell side panel we're processing
    sendToSidePanel({
      type: "STATUS",
      message: "Understanding your request...",
    });

    // Step 2: Call backend API
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/intent`, {
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

    // Step 3: Tell side panel we're searching
    sendToSidePanel({
      type: "STATUS",
      message: `Searching Amazon India for "${data.raw_query}"...`,
    });

    // Step 4: Apply price filter via URL parameter (more reliable than DOM clicks)
    const filters: Filter[] = data.filters || [];
    const {
      url: searchUrl,
      remainingFilters,
      appliedPrice,
    } = applyPriceToUrl(data.search_url, filters);

    // Step 5: Open search URL in active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) throw new Error("No active tab found");

    await chrome.tabs.update(tab.id, { url: searchUrl });

    // Step 6: Wait for page to load
    await waitForTabLoad(tab.id);
    await sleep(2000);
    // Track price as already applied (it was embedded in the URL)
    const applied: string[] = [];
    if (appliedPrice) {
      applied.push(`${appliedPrice.type}: ${appliedPrice.value}`);
    }

    if (remainingFilters.length === 0) {
      sendToSidePanel({
        type: "RESULT",
        data: {
          filters_applied: applied,
          filters_failed: [],
          search_url: searchUrl,
        },
      });
      return;
    }

    sendToSidePanel({
      type: "STATUS",
      message: `Applying ${remainingFilters.length} filter(s)...`,
    });

    const failed: string[] = [];

    for (let i = 0; i < remainingFilters.length; i++) {
      const filter = remainingFilters[i];
      sendToSidePanel({
        type: "STATUS",
        message: `Applying filter ${i + 1}/${remainingFilters.length}: ${filter.type} → ${filter.value}`,
      });

      try {
        const result = await sendToContentScript(tab.id, {
          type: "APPLY_ONE_FILTER",
          filter,
        });

        if (result?.success) {
          applied.push(`${filter.type}: ${filter.value}`);
          // Amazon reloads after filter click — wait for the page to settle
          if (i < remainingFilters.length - 1) {
            await waitForTabLoad(tab.id);
            await sleep(2000);
          }
        } else {
          failed.push(`${filter.type}: ${filter.value}`);
        }
      } catch {
        // Content script not available — try injecting it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });
          await sleep(500);

          const result = await sendToContentScript(tab.id, {
            type: "APPLY_ONE_FILTER",
            filter,
          });

          if (result?.success) {
            applied.push(`${filter.type}: ${filter.value}`);
            if (i < remainingFilters.length - 1) {
              await waitForTabLoad(tab.id);
              await sleep(2000);
            }
          } else {
            failed.push(`${filter.type}: ${filter.value}`);
          }
        } catch {
          failed.push(`${filter.type}: ${filter.value}`);
        }
      }
    }

    // Step 7: Send final results to side panel
    sendToSidePanel({
      type: "RESULT",
      data: {
        filters_applied: applied,
        filters_failed: failed,
        search_url: searchUrl,
      },
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

async function sendToContentScript(
  tabId: number,
  message: unknown,
): Promise<{ success: boolean; filter: unknown }> {
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
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout after 15 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
