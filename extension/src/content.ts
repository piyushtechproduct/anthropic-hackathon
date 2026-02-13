// Content script — thin dispatcher that routes to platform-specific adapters

import type { PlatformAdapter } from "./adapters/types";
import { AmazonAdapter } from "./adapters/amazon";
import { FlipkartAdapter } from "./adapters/flipkart";

function getAdapter(): PlatformAdapter | null {
  const host = window.location.hostname;
  if (host.includes("amazon.in")) return new AmazonAdapter();
  if (host.includes("flipkart.com")) return new FlipkartAdapter();
  return null;
}

if (!(globalThis as any).__aiCommerceContent) {
  (globalThis as any).__aiCommerceContent = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const adapter = getAdapter();
    if (!adapter) {
      sendResponse({ success: false, error: "unsupported platform" });
      return true;
    }

    if (message.type === "APPLY_FILTERS") {
      (async () => {
        const applied: string[] = [];
        const failed: string[] = [];
        const ready = await adapter.waitForFilters();
        if (!ready) {
          sendResponse({
            applied,
            failed: message.filters.map(
              (f: { type: string; value: string }) => `${f.type}: ${f.value}`,
            ),
          });
          return;
        }
        for (const filter of message.filters) {
          const ok = await adapter.applyOneFilter(filter);
          (ok ? applied : failed).push(`${filter.type}: ${filter.value}`);
        }
        sendResponse({ applied, failed });
      })();
      return true;
    }

    if (message.type === "APPLY_ONE_FILTER") {
      adapter
        .applyOneFilter(message.filter)
        .then((success) => sendResponse({ success, filter: message.filter }));
      return true;
    }

    if (message.type === "EXTRACT_PRODUCTS") {
      adapter
        .extractProducts(message.count || 10, message.ratingMap)
        .then((products) => sendResponse({ products }));
      return true;
    }
  });
}
