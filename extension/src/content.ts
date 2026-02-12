// Content script for Amazon India — parses filter sidebar and clicks filters

interface FilterRequest {
  type: string;
  value: string;
}

interface FilterResult {
  applied: string[];
  failed: string[];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "APPLY_FILTERS") {
    applyFilters(message.filters).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (message.type === "APPLY_ONE_FILTER") {
    applyOneFilter(message.filter).then((success) =>
      sendResponse({ success, filter: message.filter }),
    );
    return true;
  }
});

async function applyFilters(filters: FilterRequest[]): Promise<FilterResult> {
  const applied: string[] = [];
  const failed: string[] = [];

  // Wait for the filter sidebar to appear
  const sidebar = await waitForSidebar();
  if (!sidebar) {
    return { applied, failed: filters.map((f) => `${f.type}: ${f.value}`) };
  }

  for (const filter of filters) {
    const success = await applyOneFilter(filter);
    if (success) {
      applied.push(`${filter.type}: ${filter.value}`);
    } else {
      failed.push(`${filter.type}: ${filter.value}`);
    }
  }

  return { applied, failed };
}

async function waitForSidebar(): Promise<HTMLElement | null> {
  // Poll for up to 10 seconds
  for (let i = 0; i < 20; i++) {
    const el = document.getElementById("s-refinements");
    if (el) return el;
    await sleep(500);
  }
  return null;
}

async function applyOneFilter(filter: FilterRequest): Promise<boolean> {
  const refinements = document.getElementById("s-refinements");
  if (!refinements) return false;

  // Strategy 1: Find exact or partial text match in filter links
  const links = refinements.querySelectorAll(
    "a, span[data-action='s-ref-filter-click']",
  );
  for (const el of links) {
    const text = (el as HTMLElement).innerText?.trim().toLowerCase() || "";
    if (matchesFilter(text, filter)) {
      (el as HTMLElement).click();
      return true;
    }
  }

  // Strategy 2: Find checkbox-style filters (label + input)
  const labels = refinements.querySelectorAll("label, li");
  for (const label of labels) {
    const text = (label as HTMLElement).innerText?.trim().toLowerCase() || "";
    if (matchesFilter(text, filter)) {
      const clickTarget =
        label.querySelector("a") ||
        label.querySelector("input") ||
        (label as HTMLElement);
      (clickTarget as HTMLElement).click();
      return true;
    }
  }

  // Strategy 3: Try "See more" links to expand collapsed filter sections
  const seeMoreLinks = refinements.querySelectorAll(
    "a.a-expander-header, span.a-expander-prompt",
  );
  for (const link of seeMoreLinks) {
    const sectionText = link.closest("div")?.textContent?.toLowerCase() || "";
    if (filter.type === "brand" && sectionText.includes("brand")) {
      (link as HTMLElement).click();
      await sleep(800);
      // Retry after expanding
      return retryFilterInSection(refinements, filter);
    }
  }

  return false;
}

async function retryFilterInSection(
  refinements: HTMLElement,
  filter: FilterRequest,
): Promise<boolean> {
  const links = refinements.querySelectorAll("a, li");
  for (const el of links) {
    const text = (el as HTMLElement).innerText?.trim().toLowerCase() || "";
    if (matchesFilter(text, filter)) {
      const clickTarget = el.querySelector("a") || (el as HTMLElement);
      (clickTarget as HTMLElement).click();
      return true;
    }
  }
  return false;
}

function matchesFilter(text: string, filter: FilterRequest): boolean {
  const value = filter.value.toLowerCase();

  // Direct substring match
  if (text.includes(value)) return true;

  // For price filters, try to match range patterns like "₹1,000 - ₹5,000"
  if (filter.type === "price") {
    if (text.includes("₹") || text.includes("rs")) {
      const cleaned = value.replace(/[₹,\s]/g, "");
      const textCleaned = text.replace(/[₹,\s]/g, "");
      if (textCleaned.includes(cleaned)) return true;

      // Match "under X" against Amazon's "Under ₹X" format
      const underMatch = value.match(/under\s*(\d+)/);
      if (underMatch) {
        const targetPrice = underMatch[1];
        if (textCleaned.includes(`under${targetPrice}`)) return true;
      }
    }
  }

  // For rating filters, match patterns like "4 Stars & Up"
  if (filter.type === "rating") {
    const ratingNum = value.match(/(\d)/);
    if (ratingNum && text.includes(ratingNum[1]) && text.includes("up")) {
      return true;
    }
  }

  // For brand filters, case-insensitive match
  if (filter.type === "brand") {
    const words = text.split(/\s+/);
    if (words.some((w) => w === value)) return true;
    // Also try without splitting (e.g. "Nike" in "Nike Men's Clothing")
    if (text.startsWith(value + " ") || text === value) return true;
  }

  // For delivery/prime filters
  if (filter.type === "delivery") {
    if (value.includes("prime") && text.includes("prime")) return true;
    if (
      value.includes("free") &&
      text.includes("free") &&
      text.includes("delivery")
    )
      return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
