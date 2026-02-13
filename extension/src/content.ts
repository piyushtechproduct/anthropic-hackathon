/**
 * Content Script - Routes to platform-specific adapters
 * Injected into Amazon and Flipkart pages
 */

import type { PlatformAdapter } from './adapters/types';
import type { Filter } from './types';
import { AmazonAdapter } from './adapters/amazon';
import { FlipkartAdapter } from './adapters/flipkart';

// Guard against double-injection
if ((globalThis as any).__aiCommerceContent) {
  console.log('[AI Commerce] Content script already injected, skipping');
} else {
  (globalThis as any).__aiCommerceContent = true;

  // Determine platform and instantiate adapter
  const hostname = window.location.hostname;
  let adapter: PlatformAdapter | null = null;

  if (hostname.includes('amazon.in')) {
    adapter = new AmazonAdapter();
  } else if (hostname.includes('flipkart.com')) {
    adapter = new FlipkartAdapter();
  } else {
    console.error('[AI Commerce] Unknown platform:', hostname);
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!adapter) {
      sendResponse({ error: 'No adapter for this platform' });
      return;
    }

    (async () => {
      try {
        switch (message.type) {
          case 'APPLY_ONE_FILTER': {
            const filter: Filter = message.payload.filter;

            // Wait for filters to be ready
            await adapter.waitForFilters();

            // Apply the filter
            const success = await adapter.applyOneFilter(filter);

            // Check if navigation occurred (URL changed or page is reloading)
            const navigationOccurred = await checkForNavigation();

            sendResponse({ success, navigationOccurred });
            break;
          }

          case 'EXTRACT_PRODUCTS': {
            const count: number = message.payload.count || 10;

            // Wait for filters to be ready (ensures page is loaded)
            await adapter.waitForFilters();

            // Extract products
            const products = await adapter.extractProducts(count);

            sendResponse({ products });
            break;
          }

          default:
            sendResponse({ error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('[AI Commerce] Content script error:', error);
        sendResponse({ error: error.message });
      }
    })();

    // Return true to indicate async response
    return true;
  });

  console.log(`[AI Commerce] Content script loaded for ${adapter?.platformName}`);
}

/**
 * Check if navigation/reload occurred after filter click
 */
async function checkForNavigation(): Promise<boolean> {
  // Wait a moment to see if page starts reloading
  await new Promise(resolve => setTimeout(resolve, 300));

  // Check if document is still interactive/complete
  return document.readyState !== 'complete';
}
