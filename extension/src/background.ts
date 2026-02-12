const BACKEND_URL = "http://localhost:8000";

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId! });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SEARCH_REQUEST") {
    handleSearchRequest(message.prompt);
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

    // Step 4: Open search URL in active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) throw new Error("No active tab found");

    await chrome.tabs.update(tab.id, { url: data.search_url });

    // Step 5: Wait for page to load
    await waitForTabLoad(tab.id);
    await sleep(2000);

    // Step 6: Apply filters one at a time to handle page reloads
    const filters = data.filters || [];
    if (filters.length === 0) {
      sendToSidePanel({
        type: "RESULT",
        data: {
          filters_applied: [],
          filters_failed: [],
          search_url: data.search_url,
        },
      });
      return;
    }

    sendToSidePanel({
      type: "STATUS",
      message: `Applying ${filters.length} filter(s)...`,
    });

    const applied: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      sendToSidePanel({
        type: "STATUS",
        message: `Applying filter ${i + 1}/${filters.length}: ${filter.type} → ${filter.value}`,
      });

      try {
        const result = await sendToContentScript(tab.id, {
          type: "APPLY_ONE_FILTER",
          filter,
        });

        if (result?.success) {
          applied.push(`${filter.type}: ${filter.value}`);
          // Amazon reloads after filter click — wait for the page to settle
          if (i < filters.length - 1) {
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
            if (i < filters.length - 1) {
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
        search_url: data.search_url,
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
