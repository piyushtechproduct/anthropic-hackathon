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

    // Handle search asynchronously with conversation history
    handleSearchRequest(
      message.payload.prompt,
      message.payload.conversation_history || []
    ).catch(error => {
      console.error('[Background] Search error:', error);
      sendError('An unexpected error occurred. Please try again.');
    });

    return false; // Synchronous response sent
  }
  return false;
});

async function handleSearchRequest(prompt: string, conversation_history: string[] = []) {
  try {
    // Step 1: Extract intent from backend with conversation context
    if (conversation_history.length > 0) {
      console.log(`[Background] Using conversation context: ${conversation_history.length} previous prompts`);
      sendStatus('Understanding your request (with context)...');
    } else {
      sendStatus('Understanding your request...');
    }

    const intentResponse = await fetch(`${BACKEND_URL}/api/intent/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        conversation_history
      })
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

    for (let i = 0; i < platformResults.length; i++) {
      const result = platformResults[i];
      const platformName = intent.platforms[i].platform;

      if (result.status === 'fulfilled') {
        console.log(`[Background] ${platformName} returned ${result.value.length} products`);
        if (result.value.length > 0) {
          allProducts.push(...result.value);
        }
      } else {
        console.error(`[Background] ${platformName} failed:`, result.reason);
      }
    }

    console.log(`[Background] Total products from all platforms: ${allProducts.length}`);

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

    let products = extractResult.products || [];
    console.log(`[Background] Extracted ${products.length} products from ${platformIntent.platform}`);

    // Validate products against filters (especially price)
    const priceFilter = platformIntent.filters.find(f => f.type === 'price');
    if (priceFilter) {
      const beforeCount = products.length;
      products = filterProductsByPrice(products, priceFilter.value);
      const afterCount = products.length;
      if (beforeCount !== afterCount) {
        console.log(`[Background] Price filter validation: ${beforeCount} → ${afterCount} products (removed ${beforeCount - afterCount} out-of-range)`);
      }
    }

    return products;

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

  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  // Parse different price formats
  const value = priceFilter.value;

  // Format 1: "between X and Y"
  const betweenMatch = value.match(/between\s+₹?(\d+)\s+and\s+₹?(\d+)/i);
  if (betweenMatch) {
    minPrice = parseInt(betweenMatch[1]);
    maxPrice = parseInt(betweenMatch[2]);
  }
  // Format 2: Range "₹300-₹500" or "300-500" or "300 to 500"
  else if (value.match(/₹?(\d+)\s*(?:-|to)\s*₹?(\d+)/i)) {
    const rangeMatch = value.match(/₹?(\d+)\s*(?:-|to)\s*₹?(\d+)/i);
    if (rangeMatch) {
      minPrice = parseInt(rangeMatch[1]);
      maxPrice = parseInt(rangeMatch[2]);
    }
  }
  // Format 3: Under/Below "Under ₹500" or "Below 500"
  else if (value.match(/under|below/i)) {
    const match = value.match(/(\d+)/);
    if (match) {
      maxPrice = parseInt(match[1]);
    }
  }
  // Format 4: Above/Minimum "₹500+" or "Above 500"
  else if (value.match(/above|over|\+/i)) {
    const match = value.match(/(\d+)/);
    if (match) {
      minPrice = parseInt(match[1]);
    }
  }
  // Format 5: Just a number (assume maximum)
  else {
    const match = value.match(/(\d+)/);
    if (match) {
      maxPrice = parseInt(match[1]);
    }
  }

  console.log(`[Background] Price filter: ${value} → min: ${minPrice}, max: ${maxPrice}`);

  if (!minPrice && !maxPrice) {
    console.warn('[Background] Could not parse price filter:', value);
    return { url: baseUrl, remainingFilters: filters };
  }

  let modifiedUrl = baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';

  if (platform === 'amazon') {
    // Amazon URL format: rh=p_36%3A{min_paise}-{max_paise}
    const minPaise = minPrice ? minPrice * 100 : 0;
    const maxPaise = maxPrice ? maxPrice * 100 : '';
    modifiedUrl = `${baseUrl}${separator}rh=p_36%3A${minPaise}-${maxPaise}`;
  } else if (platform === 'flipkart') {
    // Flipkart URL format: p[]=facets.price_range.from={min}&p[]=facets.price_range.to={max}
    const min = minPrice || 'Min';
    const max = maxPrice || 'Max';
    modifiedUrl = `${baseUrl}${separator}p%5B%5D=facets.price_range.from%3D${min}&p%5B%5D=facets.price_range.to%3D${max}`;
  }

  console.log(`[Background] Modified URL for ${platform}:`, modifiedUrl);

  // Return URL with price applied and remaining filters
  const remainingFilters = filters.filter(f => f.type !== 'price');
  return { url: modifiedUrl, remainingFilters };
}

function filterProductsByPrice(products: Product[], priceFilterValue: string): Product[] {
  // Parse price constraints from filter value
  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  const value = priceFilterValue;

  // Format 1: "between X and Y"
  const betweenMatch = value.match(/between\s+₹?(\d+)\s+and\s+₹?(\d+)/i);
  if (betweenMatch) {
    minPrice = parseInt(betweenMatch[1]);
    maxPrice = parseInt(betweenMatch[2]);
  }
  // Format 2: Range "₹300-₹500" or "300-500" or "300 to 500"
  else if (value.match(/₹?(\d+)\s*(?:-|to)\s*₹?(\d+)/i)) {
    const rangeMatch = value.match(/₹?(\d+)\s*(?:-|to)\s*₹?(\d+)/i);
    if (rangeMatch) {
      minPrice = parseInt(rangeMatch[1]);
      maxPrice = parseInt(rangeMatch[2]);
    }
  }
  // Format 3: Under/Below "Under ₹500"
  else if (value.match(/under|below/i)) {
    const match = value.match(/(\d+)/);
    if (match) {
      maxPrice = parseInt(match[1]);
    }
  }
  // Format 3: Above/Minimum "₹500+" or "Above 500"
  else if (value.match(/above|over|\+/i)) {
    const match = value.match(/(\d+)/);
    if (match) {
      minPrice = parseInt(match[1]);
    }
  }
  // Format 4: Just a number (assume maximum)
  else {
    const match = value.match(/(\d+)/);
    if (match) {
      maxPrice = parseInt(match[1]);
    }
  }

  console.log(`[Background] Filtering products by price: min=${minPrice}, max=${maxPrice}`);

  // Filter products
  return products.filter(product => {
    const price = product.price;

    // Check minimum
    if (minPrice !== null && price < minPrice) {
      console.log(`[Background] Rejected ${product.title.substring(0, 40)}: ₹${price} < min ₹${minPrice}`);
      return false;
    }

    // Check maximum
    if (maxPrice !== null && price > maxPrice) {
      console.log(`[Background] Rejected ${product.title.substring(0, 40)}: ₹${price} > max ₹${maxPrice}`);
      return false;
    }

    return true;
  });
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
  console.log(`[Background] Interleaving ${products.length} total products`);

  // Separate by platform
  const amazonProducts = products
    .filter(p => p.platform === 'amazon')
    .sort((a, b) => deterministicScore(b) - deterministicScore(a))
    .slice(0, 3);

  const flipkartProducts = products
    .filter(p => p.platform === 'flipkart')
    .sort((a, b) => deterministicScore(b) - deterministicScore(a))
    .slice(0, 3);

  console.log(`[Background] After filtering: ${amazonProducts.length} Amazon, ${flipkartProducts.length} Flipkart`);
  console.log(`[Background] Amazon products:`, amazonProducts.map(p => p.title.substring(0, 50)));
  console.log(`[Background] Flipkart products:`, flipkartProducts.map(p => p.title.substring(0, 50)));

  // Interleave: Amazon, Flipkart, Amazon, Flipkart, ...
  const interleaved: Product[] = [];
  const maxLength = Math.max(amazonProducts.length, flipkartProducts.length);

  for (let i = 0; i < maxLength; i++) {
    if (i < amazonProducts.length) {
      interleaved.push(amazonProducts[i]);
      console.log(`[Background] Added Amazon product ${i + 1}: ${amazonProducts[i].title.substring(0, 50)}`);
    }
    if (i < flipkartProducts.length) {
      interleaved.push(flipkartProducts[i]);
      console.log(`[Background] Added Flipkart product ${i + 1}: ${flipkartProducts[i].title.substring(0, 50)}`);
    }
  }

  console.log(`[Background] Final interleaved: ${interleaved.length} products`);
  console.log(`[Background] Order:`, interleaved.map(p => `${p.platform}:${p.title.substring(0, 30)}`));

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
