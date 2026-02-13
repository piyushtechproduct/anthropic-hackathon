/**
 * Background Service Worker - Orchestrates the entire flow
 */

import type { MultiPlatformIntentResponse, Product, Filter, PlatformIntent } from './types';

const BACKEND_URL = 'http://localhost:8000';
const SEARCH_TIMEOUT = 45000; // 45 seconds

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEARCH_REQUEST') {
    // Acknowledge receipt immediately
    sendResponse({ received: true });

    // Handle search asynchronously (don't wait for it)
    handleSearchRequest(message.payload.prompt).catch(error => {
      console.error('[Background] Search error:', error);
      sendError('An unexpected error occurred. Please try again.');
    });

    return false; // Synchronous response sent
  }
  return false;
});

async function handleSearchRequest(prompt: string) {
  try {
    // Step 1: Extract intent from backend
    sendStatus('Understanding your request...');

    const intentResponse = await fetch(`${BACKEND_URL}/api/intent/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!intentResponse.ok) {
      throw new Error(`Backend returned ${intentResponse.status}`);
    }

    const intent: MultiPlatformIntentResponse = await intentResponse.json();

    // Step 2: Process each platform in parallel
    sendStatus('Searching Amazon & Flipkart...');

    const platformResults = await Promise.allSettled(
      intent.platforms.map(platformIntent =>
        processPlatform(platformIntent)
      )
    );

    // Step 3: Collect successful results
    const allProducts: Product[] = [];

    for (const result of platformResults) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allProducts.push(...result.value);
      }
    }

    if (allProducts.length === 0) {
      sendError('No products found. Please try a different search.');
      return;
    }

    // Step 4: Select top 3 per platform and interleave
    const interleavedProducts = interleaveProducts(allProducts);

    // Step 5: Send products to side panel
    sendProducts(interleavedProducts);

  } catch (error) {
    console.error('Search failed:', error);
    if (error.message.includes('Failed to fetch')) {
      sendError('Please start the backend server: cd backend && uv run uvicorn src.app.main:app --reload');
    } else {
      sendError('Search failed. Please try rephrasing your request.');
    }
  }
}

async function processPlatform(platformIntent: PlatformIntent): Promise<Product[]> {
  let tabId: number | null = null;

  try {
    console.log(`[Background] Processing ${platformIntent.platform}...`);

    // Apply price filter to URL
    const { url, remainingFilters } = applyPriceToUrl(
      platformIntent.search_url,
      platformIntent.filters,
      platformIntent.platform
    );
    console.log(`[Background] ${platformIntent.platform} URL:`, url);
    console.log(`[Background] ${platformIntent.platform} remaining filters:`, remainingFilters);

    // Create hidden background tab
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id!;
    console.log(`[Background] Created tab ${tabId} for ${platformIntent.platform}`);

    // Wait for tab to finish loading
    await waitForTabLoad(tabId);
    console.log(`[Background] Tab ${tabId} loaded`);

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    console.log(`[Background] Content script injected into tab ${tabId}`);

    // Apply remaining filters one by one
    for (const filter of remainingFilters) {
      console.log(`[Background] Applying filter on ${platformIntent.platform}:`, filter);
      const result = await sendMessageToTab(tabId, {
        type: 'APPLY_ONE_FILTER',
        payload: { filter }
      });

      if (result.navigationOccurred) {
        // Page reloaded - wait and re-inject
        console.log(`[Background] Navigation occurred, re-injecting content script`);
        await waitForTabLoad(tabId);
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
      }
    }

    // Extract products
    console.log(`[Background] Extracting products from ${platformIntent.platform}...`);
    const extractResult = await sendMessageToTab(tabId, {
      type: 'EXTRACT_PRODUCTS',
      payload: { count: 10 }
    });

    console.log(`[Background] Extracted ${extractResult.products?.length || 0} products from ${platformIntent.platform}`);
    return extractResult.products || [];

  } catch (error) {
    console.error(`[Background] Error processing ${platformIntent.platform}:`, error);
    return [];
  } finally {
    // Always close the hidden tab
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
        console.log(`[Background] Closed tab ${tabId}`);
      } catch (e) {
        // Tab might already be closed
      }
    }
  }
}

function applyPriceToUrl(
  baseUrl: string,
  filters: Filter[],
  platform: string
): { url: string; remainingFilters: Filter[] } {
  const priceFilter = filters.find(f => f.type === 'price');

  if (!priceFilter) {
    return { url: baseUrl, remainingFilters: filters };
  }

  // Extract price value (e.g., "Under ₹500" -> 500)
  const match = priceFilter.value.match(/(\d+)/);
  if (!match) {
    return { url: baseUrl, remainingFilters: filters };
  }

  const price = parseInt(match[1]);
  let modifiedUrl = baseUrl;

  if (platform === 'amazon') {
    // Amazon: rh=p_36%3A-<paise>
    const paise = price * 100;
    const separator = baseUrl.includes('?') ? '&' : '?';
    modifiedUrl = `${baseUrl}${separator}rh=p_36%3A-${paise}`;
  } else if (platform === 'flipkart') {
    // Flipkart: p[]=facets.price_range.from=Min&p[]=facets.price_range.to=<price>
    const separator = baseUrl.includes('?') ? '&' : '?';
    modifiedUrl = `${baseUrl}${separator}p%5B%5D=facets.price_range.from%3DMin&p%5B%5D=facets.price_range.to%3D${price}`;
  }

  // Return URL with price applied and remaining filters
  const remainingFilters = filters.filter(f => f.type !== 'price');
  return { url: modifiedUrl, remainingFilters };
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Give it a moment to fully stabilize
        setTimeout(() => resolve(), 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Also check if already loaded
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => resolve(), 500);
      }
    });
  });
}

function sendMessageToTab(tabId: number, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function interleaveProducts(products: Product[]): Product[] {
  // Separate by platform
  const amazonProducts = products
    .filter(p => p.platform === 'amazon')
    .sort((a, b) => deterministicScore(b) - deterministicScore(a))
    .slice(0, 3);

  const flipkartProducts = products
    .filter(p => p.platform === 'flipkart')
    .sort((a, b) => deterministicScore(b) - deterministicScore(a))
    .slice(0, 3);

  // Interleave: Amazon, Flipkart, Amazon, Flipkart, ...
  const interleaved: Product[] = [];
  const maxLength = Math.max(amazonProducts.length, flipkartProducts.length);

  for (let i = 0; i < maxLength; i++) {
    if (i < amazonProducts.length) {
      interleaved.push(amazonProducts[i]);
    }
    if (i < flipkartProducts.length) {
      interleaved.push(flipkartProducts[i]);
    }
  }

  return interleaved;
}

function deterministicScore(product: Product): number {
  // score = (rating × log(reviewCount + 1)) / price
  return (product.rating * Math.log(product.review_count + 1)) / Math.max(product.price, 1);
}

function sendStatus(text: string) {
  chrome.runtime.sendMessage({
    type: 'STATUS',
    payload: { text }
  });
}

function sendProducts(products: Product[]) {
  chrome.runtime.sendMessage({
    type: 'PRODUCTS',
    payload: { products }
  });
}

function sendError(text: string) {
  chrome.runtime.sendMessage({
    type: 'ERROR',
    payload: { text }
  });
}
