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
    chrome.runtime.sendMessage({
      type: "STATUS",
      message: "Understanding your request...",
    });

    // Step 2: Call backend API
    const response = await fetch(`${BACKEND_URL}/api/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    // Step 3: Tell side panel we're searching
    chrome.runtime.sendMessage({
      type: "STATUS",
      message: "Searching Amazon India...",
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

    // Step 6: Send filters to content script
    chrome.runtime.sendMessage({
      type: "STATUS",
      message: `Applying ${data.filters.length} filter(s)...`,
    });

    try {
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "APPLY_FILTERS",
        filters: data.filters,
      });

      // Step 7: Relay result to side panel
      chrome.runtime.sendMessage({
        type: "RESULT",
        data: {
          filters_applied: result.applied || [],
          filters_failed: result.failed || [],
          search_url: data.search_url,
        },
      });
    } catch {
      // Content script might not be injected yet, inject it manually
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await sleep(500);

      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "APPLY_FILTERS",
        filters: data.filters,
      });

      chrome.runtime.sendMessage({
        type: "RESULT",
        data: {
          filters_applied: result.applied || [],
          filters_failed: result.failed || [],
          search_url: data.search_url,
        },
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred";
    chrome.runtime.sendMessage({
      type: "ERROR",
      message: `Something went wrong: ${message}`,
    });
  }
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
