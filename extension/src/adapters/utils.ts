/**
 * Shared pure utility functions extracted from platform adapters.
 * These are DOM-free and directly unit-testable.
 */

/** Extract a numeric price from a string like "Under ₹500" or "₹1,500". */
export function extractPriceNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Format a number in Indian notation (e.g. 1,50,000). */
export function formatIndianNumber(num: number): string {
  const str = num.toString();
  if (str.length <= 3) return str;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${formatted},${last3}`;
}

/** Parse a price string like "₹1,499" into a number. Returns 0 on failure. */
export function parsePriceText(text: string): number {
  const cleaned = text.replace(/[₹,\s]/g, "");
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

/** Parse a review count string like "1,234" into a number. */
export function parseReviewCount(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s]/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Check if a price text matches a filter value (e.g. "up to ₹500" matches "under ₹500"). */
export function matchPrice(text: string, value: string): boolean {
  const priceNum = extractPriceNumber(value);
  if (priceNum === null) return false;

  if (value.includes("under")) {
    const formatted = formatIndianNumber(priceNum).toLowerCase();
    if (text.includes(`up to ₹${formatted}`)) return true;
    if (text.includes(`up to ₹${priceNum}`)) return true;
    const rangeMatch = text.match(/₹[\d,]+\s*-\s*₹([\d,]+)/);
    if (rangeMatch) {
      const upperBound = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
      if (upperBound === priceNum) return true;
    }
  }

  const rangeInValue = value.match(/₹?([\d,]+)\s*-\s*₹?([\d,]+)/);
  if (rangeInValue) {
    const low = rangeInValue[1].replace(/,/g, "");
    const high = rangeInValue[2].replace(/,/g, "");
    const textClean = text.replace(/,/g, "");
    if (textClean.includes(low) && textClean.includes(high)) return true;
  }

  return false;
}

/** Map a filter type to the Amazon sidebar section ID. */
export function getSectionIdForFilter(filterType: string): string | null {
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
