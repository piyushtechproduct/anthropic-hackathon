import type { Filter, Product } from "../types";
import type { PlatformAdapter } from "./types";

export class AmazonAdapter implements PlatformAdapter {
  platformName = "amazon" as const;

  async waitForFilters(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if (document.getElementById("s-refinements")) return true;
      await sleep(500);
    }
    return false;
  }

  async applyOneFilter(filter: Filter): Promise<boolean> {
    const refinements = document.getElementById("s-refinements");
    if (!refinements) return false;

    if (await tryAriaLabelMatch(refinements, filter)) return true;
    if (await tryScopedSectionMatch(refinements, filter)) return true;
    if (await tryFullSidebarScan(refinements, filter)) return true;
    if (await tryExpandAndRetry(refinements, filter)) return true;

    return false;
  }

  async extractProducts(count: number): Promise<Product[]> {
    const products: Product[] = [];
    const cards = document.querySelectorAll(
      'div[data-component-type="s-search-result"]',
    );

    for (const card of cards) {
      if (products.length >= count) break;

      // Skip sponsored results that are ads
      if (card.querySelector(".s-label-popover-default")) continue;

      const title = card.querySelector("h2 a span")?.textContent?.trim() || "";
      if (!title) continue;

      const priceWhole =
        card.querySelector(".a-price-whole")?.textContent?.trim() || "";
      const price = parseFloat(priceWhole.replace(/,/g, "").replace(".", ""));
      if (isNaN(price) || price <= 0) continue;

      const ratingText =
        card
          .querySelector("i.a-icon-star-small span, i.a-icon-star span")
          ?.textContent?.trim() || "";
      const ratingMatch = ratingText.match(/([\d.]+)\s*out of/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      const reviewText =
        card
          .querySelector(
            'span.a-size-base.s-underline-text, a[href*="#customerReviews"] span',
          )
          ?.textContent?.trim() || "";
      const reviewCount = parseReviewCount(reviewText);

      const imgEl = card.querySelector("img.s-image") as HTMLImageElement;
      const image_url = imgEl?.src || "";

      const linkEl = card.querySelector("h2 a") as HTMLAnchorElement;
      const href = linkEl?.getAttribute("href") || "";
      const product_url = href.startsWith("http")
        ? href
        : `https://www.amazon.in${href}`;

      products.push({
        title,
        price,
        rating,
        review_count: reviewCount,
        image_url,
        product_url,
        platform: "amazon",
      });
    }

    return products;
  }
}

// --- Filter matching strategies (moved from content.ts) ---

async function tryAriaLabelMatch(
  refinements: HTMLElement,
  filter: Filter,
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

function ariaLabelMatchesFilter(ariaLabel: string, filter: Filter): boolean {
  const value = filter.value.toLowerCase();

  if (ariaLabel.includes(value)) return true;

  if (filter.type === "price") {
    const priceNum = extractPriceNumber(value);
    if (priceNum !== null) {
      const upToPattern = `up to ₹${formatIndianNumber(priceNum)}`;
      if (ariaLabel.includes(upToPattern.toLowerCase())) return true;
      if (ariaLabel.includes(`up to ₹${priceNum}`)) return true;
    }
  }

  if (filter.type === "brand") {
    const filterText = `apply the filter ${value} to narrow results`;
    if (ariaLabel === filterText) return true;
  }

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

  if (filter.type === "rating") {
    const num = value.match(/(\d)/);
    if (num && ariaLabel.includes(`${num[1]} stars & up`)) return true;
  }

  return false;
}

async function tryScopedSectionMatch(
  refinements: HTMLElement,
  filter: Filter,
): Promise<boolean> {
  const sectionId = getSectionIdForFilter(filter.type);
  if (!sectionId) return false;

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

async function tryFullSidebarScan(
  refinements: HTMLElement,
  filter: Filter,
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

async function tryExpandAndRetry(
  refinements: HTMLElement,
  filter: Filter,
): Promise<boolean> {
  const expanders = refinements.querySelectorAll(
    '[data-action="s-show-more-filter"] a, a.a-expander-header, span.a-expander-prompt',
  );

  for (const expander of expanders) {
    const sectionText =
      expander.closest('[role="group"]')?.textContent?.toLowerCase() ||
      expander.closest(".a-section")?.textContent?.toLowerCase() ||
      "";

    const isRelevant =
      (filter.type === "brand" && sectionText.includes("brand")) ||
      (filter.type === "size" && sectionText.includes("size")) ||
      (filter.type === "color" &&
        (sectionText.includes("colour") || sectionText.includes("color")));

    if (isRelevant) {
      (expander as HTMLElement).click();
      await sleep(800);

      if (await tryAriaLabelMatch(refinements, filter)) return true;
      if (await tryFullSidebarScan(refinements, filter)) return true;
    }
  }
  return false;
}

function textMatchesFilter(text: string, filter: Filter): boolean {
  const value = filter.value.toLowerCase();

  if (text.includes(value)) return true;

  if (filter.type === "price") {
    return matchPrice(text, value);
  }

  if (filter.type === "rating") {
    const num = value.match(/(\d)/);
    if (num) {
      if (text.includes(`${num[1]} stars`) && text.includes("up")) return true;
      if (text.includes(`${num[1]} star`) && text.includes("up")) return true;
    }
  }

  if (filter.type === "brand") {
    if (text === value) return true;
    const words = text.split(/\s+/);
    if (words.some((w) => w === value)) return true;
  }

  if (filter.type === "delivery") {
    if (value.includes("prime") || value.includes("fast")) {
      if (text.includes("get it today") || text.includes("get it by tomorrow"))
        return true;
    }
    if (value.includes("free") && text.includes("free shipping")) return true;
  }

  if (filter.type === "color" || filter.type === "colour") {
    if (text === value || text.includes(value)) return true;
  }

  return false;
}

function matchPrice(text: string, value: string): boolean {
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

function extractPriceNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function formatIndianNumber(num: number): string {
  const str = num.toString();
  if (str.length <= 3) return str;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${formatted},${last3}`;
}

function parseReviewCount(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s]/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
