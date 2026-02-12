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

  // Strategy 1: Use aria-label which is the most reliable selector on Amazon
  // Amazon uses: aria-label="Apply the filter {value} to narrow results"
  if (await tryAriaLabelMatch(refinements, filter)) return true;

  // Strategy 2: Scoped section search — find the right section then match text
  if (await tryScopedSectionMatch(refinements, filter)) return true;

  // Strategy 3: Full sidebar text scan as fallback
  if (await tryFullSidebarScan(refinements, filter)) return true;

  // Strategy 4: Expand "See more" in relevant section and retry
  if (await tryExpandAndRetry(refinements, filter)) return true;

  return false;
}

// Strategy 1: Match via aria-label attribute
async function tryAriaLabelMatch(
  refinements: HTMLElement,
  filter: FilterRequest,
): Promise<boolean> {
  const allLinks = refinements.querySelectorAll("li a[aria-label]");
  for (const link of allLinks) {
    const ariaLabel =
      link.getAttribute("aria-label")?.toLowerCase().trim() || "";
    if (ariaLabelMatchesFilter(ariaLabel, filter)) {
      (link as HTMLElement).click();
      return true;
    }
  }
  return false;
}

function ariaLabelMatchesFilter(
  ariaLabel: string,
  filter: FilterRequest,
): boolean {
  // aria-label format: "Apply the filter {value} to narrow results"
  const value = filter.value.toLowerCase();

  // Direct match
  if (ariaLabel.includes(value)) return true;

  // For price: backend says "Under ₹500" but Amazon says "Up to ₹500"
  if (filter.type === "price") {
    const priceNum = extractPriceNumber(value);
    if (priceNum !== null) {
      // Match "Up to ₹X" format
      const upToPattern = `up to ₹${formatIndianNumber(priceNum)}`;
      if (ariaLabel.includes(upToPattern.toLowerCase())) return true;

      // Also try without comma formatting
      if (ariaLabel.includes(`up to ₹${priceNum}`)) return true;
    }
  }

  // For brand: case-insensitive exact match
  if (filter.type === "brand") {
    const filterText = `apply the filter ${value} to narrow results`;
    if (ariaLabel === filterText) return true;
  }

  // For delivery: map "Prime" → "Get It Today"/"Free Shipping"
  if (filter.type === "delivery") {
    if (value.includes("prime") || value.includes("fast")) {
      if (
        ariaLabel.includes("get it today") ||
        ariaLabel.includes("get it by tomorrow")
      )
        return true;
    }
    if (value.includes("free")) {
      if (ariaLabel.includes("free shipping")) return true;
    }
  }

  // For rating: "4★ & up" or "4 Stars & Up"
  if (filter.type === "rating") {
    const num = value.match(/(\d)/);
    if (num && ariaLabel.includes(`${num[1]} stars & up`)) return true;
  }

  return false;
}

// Strategy 2: Find the correct section by ID/heading, then match text within
async function tryScopedSectionMatch(
  refinements: HTMLElement,
  filter: FilterRequest,
): Promise<boolean> {
  const sectionId = getSectionIdForFilter(filter.type);
  if (!sectionId) return false;

  // Try matching by section ID suffix
  const section =
    refinements.querySelector(`[id*="${sectionId}"]`) ||
    refinements.querySelector(`#${sectionId}`);
  if (!section) return false;

  const links = section.querySelectorAll("li a[href]");
  for (const link of links) {
    const text =
      (link as HTMLElement).textContent?.trim().replace(/\s+/g, " ") || "";
    if (textMatchesFilter(text.toLowerCase(), filter)) {
      (link as HTMLElement).click();
      return true;
    }
  }
  return false;
}

function getSectionIdForFilter(filterType: string): string | null {
  const sectionMap: Record<string, string> = {
    brand: "brandsRefinements",
    price: "priceRefinements",
    delivery: "deliveryRefinements",
    rating: "reviewsRefinements",
    size: "sizeRefinements",
    color: "size_two_browse",
    colour: "size_two_browse",
    discount: "pct-off",
  };
  return sectionMap[filterType.toLowerCase()] || null;
}

// Strategy 3: Full sidebar scan with text matching
async function tryFullSidebarScan(
  refinements: HTMLElement,
  filter: FilterRequest,
): Promise<boolean> {
  const links = refinements.querySelectorAll("li a[href]");
  for (const link of links) {
    const text =
      (link as HTMLElement).textContent?.trim().replace(/\s+/g, " ") || "";
    if (textMatchesFilter(text.toLowerCase(), filter)) {
      (link as HTMLElement).click();
      return true;
    }
  }
  return false;
}

// Strategy 4: Expand "See more" in the filter section and retry
async function tryExpandAndRetry(
  refinements: HTMLElement,
  filter: FilterRequest,
): Promise<boolean> {
  // Find all expander elements
  const expanders = refinements.querySelectorAll(
    '[data-action="s-show-more-filter"] a, a.a-expander-header, span.a-expander-prompt',
  );

  for (const expander of expanders) {
    const sectionText =
      expander.closest('[role="group"]')?.textContent?.toLowerCase() ||
      expander.closest(".a-section")?.textContent?.toLowerCase() ||
      "";

    // Only expand if the section looks relevant to this filter type
    const isRelevant =
      (filter.type === "brand" && sectionText.includes("brand")) ||
      (filter.type === "size" && sectionText.includes("size")) ||
      (filter.type === "color" &&
        (sectionText.includes("colour") || sectionText.includes("color")));

    if (isRelevant) {
      (expander as HTMLElement).click();
      await sleep(800);

      // Retry with aria-label and text match after expanding
      if (await tryAriaLabelMatch(refinements, filter)) return true;
      if (await tryFullSidebarScan(refinements, filter)) return true;
    }
  }
  return false;
}

// Text matching logic
function textMatchesFilter(text: string, filter: FilterRequest): boolean {
  const value = filter.value.toLowerCase();

  // Direct substring match
  if (text.includes(value)) return true;

  // Price filter matching
  if (filter.type === "price") {
    return matchPrice(text, value);
  }

  // Rating filter: "4★ & up" → "4 Stars & Up" or "4 stars & up"
  if (filter.type === "rating") {
    const num = value.match(/(\d)/);
    if (num) {
      if (text.includes(`${num[1]} stars`) && text.includes("up")) return true;
      if (text.includes(`${num[1]} star`) && text.includes("up")) return true;
    }
  }

  // Brand filter: case-insensitive word match
  if (filter.type === "brand") {
    if (text === value) return true;
    // Match as a word boundary (e.g. "Nike" in text "Nike")
    const words = text.split(/\s+/);
    if (words.some((w) => w === value)) return true;
  }

  // Delivery filter
  if (filter.type === "delivery") {
    if (value.includes("prime") || value.includes("fast")) {
      if (text.includes("get it today") || text.includes("get it by tomorrow"))
        return true;
    }
    if (value.includes("free") && text.includes("free shipping")) return true;
  }

  // Color filter
  if (filter.type === "color" || filter.type === "colour") {
    if (text === value || text.includes(value)) return true;
  }

  return false;
}

// Price matching — handles the mismatch between backend and Amazon formats
function matchPrice(text: string, value: string): boolean {
  const priceNum = extractPriceNumber(value);
  if (priceNum === null) return false;

  // "Under ₹500" → match "Up to ₹500"
  if (value.includes("under")) {
    const formatted = formatIndianNumber(priceNum).toLowerCase();
    if (text.includes(`up to ₹${formatted}`)) return true;
    if (text.includes(`up to ₹${priceNum}`)) return true;
    // Also try matching a range that includes the price: "₹200 - ₹500"
    const rangeMatch = text.match(/₹[\d,]+\s*-\s*₹([\d,]+)/);
    if (rangeMatch) {
      const upperBound = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
      if (upperBound === priceNum) return true;
    }
  }

  // "₹X - ₹Y" format — match if text contains the same range
  const rangeInValue = value.match(/₹?([\d,]+)\s*-\s*₹?([\d,]+)/);
  if (rangeInValue) {
    const low = rangeInValue[1].replace(/,/g, "");
    const high = rangeInValue[2].replace(/,/g, "");
    const textClean = text.replace(/,/g, "");
    if (textClean.includes(low) && textClean.includes(high)) return true;
  }

  return false;
}

// Extract numeric price from strings like "Under ₹500", "Under ₹15,000", "₹2000"
function extractPriceNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Format number with Indian comma system: 1000→1,000, 15000→15,000, 100000→1,00,000
function formatIndianNumber(num: number): string {
  const str = num.toString();
  if (str.length <= 3) return str;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${formatted},${last3}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
