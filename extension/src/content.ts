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
});

async function applyFilters(filters: FilterRequest[]): Promise<FilterResult> {
  const applied: string[] = [];
  const failed: string[] = [];

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
      await sleep(300);
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
      clickTarget.click();
      await sleep(300);
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
  if (filter.type === "price" && text.includes("₹")) {
    const cleaned = value.replace(/[₹,\s]/g, "");
    const textCleaned = text.replace(/[₹,\s]/g, "");
    if (textCleaned.includes(cleaned)) return true;
  }

  // For rating filters, match patterns like "4 Stars & Up"
  if (filter.type === "rating" && text.includes("star")) {
    if (text.includes(value)) return true;
  }

  // For brand filters, try case-insensitive word match
  if (filter.type === "brand") {
    const words = text.split(/\s+/);
    if (words.some((w) => w === value)) return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
