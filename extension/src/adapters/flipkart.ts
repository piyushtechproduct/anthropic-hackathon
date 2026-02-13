import type { Filter, Product } from "../types";
import type { PlatformAdapter } from "./types";

export class FlipkartAdapter implements PlatformAdapter {
  platformName = "flipkart" as const;

  async waitForFilters(): Promise<boolean> {
    // Flipkart filter sidebar loads with the page; wait for product cards as a proxy
    for (let i = 0; i < 20; i++) {
      if (document.querySelector("div[data-id]")) return true;
      await sleep(500);
    }
    return false;
  }

  async applyOneFilter(filter: Filter): Promise<boolean> {
    // Strategy 1: Checkbox filters (brand, size, color, rating, discount)
    if (await tryCheckboxFilter(filter)) return true;

    // Strategy 2: Price filter via dropdowns
    if (filter.type === "price") {
      if (await tryPriceFilter(filter)) return true;
    }

    // Strategy 3: Text-based fallback — find any clickable element matching the value
    if (await tryTextFallback(filter)) return true;

    return false;
  }

  async extractProducts(count: number): Promise<Product[]> {
    const products: Product[] = [];
    const cards = document.querySelectorAll("div[data-id]");

    for (const card of cards) {
      if (products.length >= count) break;

      // Skip ad/sponsored cards
      if (card.querySelector("[data-tkid]")) continue;

      const product =
        extractFromGridLayout(card) || extractFromListLayout(card);
      if (product) products.push(product);
    }

    return products;
  }
}

// --- Product extraction for grid layout (fashion/clothing) ---

function extractFromGridLayout(card: Element): Product | null {
  // Grid layout uses a.CIaYa1 for image links and div.Fo1I0b for brand
  const titleEl =
    card.querySelector("a.atJtCj") ||
    card.querySelector("a.WKTcLC") ||
    findByStructure(card, "title-grid");
  const title = titleEl?.textContent?.trim() || "";
  if (!title) return null;

  const price = extractPrice(card);
  if (price <= 0) return null;

  const linkEl =
    card.querySelector("a.CIaYa1") ||
    card.querySelector("a.atJtCj") ||
    card.querySelector("a[href*='/p/']");
  const href = linkEl?.getAttribute("href") || "";
  const product_url = href.startsWith("http")
    ? href
    : `https://www.flipkart.com${href}`;

  const imgEl =
    (card.querySelector("img.MZeksS") as HTMLImageElement) ||
    (card.querySelector("img.UCc1lI") as HTMLImageElement) ||
    (card.querySelector("img[src*='flixcart']") as HTMLImageElement);
  const image_url = imgEl?.src || "";

  // Grid layout typically doesn't show ratings
  const { rating, reviewCount } = extractRatingAndReviews(card);

  return {
    title,
    price,
    rating,
    review_count: reviewCount,
    image_url,
    product_url,
    platform: "flipkart",
  };
}

// --- Product extraction for list layout (electronics) ---

function extractFromListLayout(card: Element): Product | null {
  const titleEl =
    card.querySelector("div.RG5Slk") ||
    card.querySelector("a.k7wcnx div.RG5Slk") ||
    findByStructure(card, "title-list");
  const title = titleEl?.textContent?.trim() || "";
  if (!title) return null;

  const price = extractPrice(card);
  if (price <= 0) return null;

  const linkEl =
    card.querySelector("a.k7wcnx") || card.querySelector("a[href*='/p/']");
  const href = linkEl?.getAttribute("href") || "";
  const product_url = href.startsWith("http")
    ? href
    : `https://www.flipkart.com${href}`;

  const imgEl =
    (card.querySelector("img.UCc1lI") as HTMLImageElement) ||
    (card.querySelector("img.MZeksS") as HTMLImageElement) ||
    (card.querySelector("img[src*='flixcart']") as HTMLImageElement);
  const image_url = imgEl?.src || "";

  const { rating, reviewCount } = extractRatingAndReviews(card);

  return {
    title,
    price,
    rating,
    review_count: reviewCount,
    image_url,
    product_url,
    platform: "flipkart",
  };
}

// --- Shared extraction helpers ---

function extractPrice(card: Element): number {
  // Price class div.hZ3P6w is shared across both layouts
  const priceEl =
    card.querySelector("div.hZ3P6w") || card.querySelector("div.Nx9bqj"); // alternate class name
  const priceText = priceEl?.textContent?.trim() || "";
  // Price format: "₹977" or "₹1,299"
  const cleaned = priceText.replace(/[₹,\s]/g, "");
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

function extractRatingAndReviews(card: Element): {
  rating: number | null;
  reviewCount: number | null;
} {
  // Rating badge: div inside span.CjyrHS or div.MKiFS6
  const ratingEl =
    card.querySelector("div.MKiFS6") || card.querySelector("span.CjyrHS div");
  let rating: number | null = null;
  if (ratingEl) {
    const ratingText = ratingEl.textContent?.trim() || "";
    const ratingMatch = ratingText.match(/([\d.]+)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
  }

  // Reviews: spans inside span.PvbNMB
  let reviewCount: number | null = null;
  const reviewSpans = card.querySelectorAll("span.PvbNMB span");
  for (const span of reviewSpans) {
    const text = span.textContent?.trim() || "";
    if (text.toLowerCase().includes("rating")) {
      // "2,72,197 Ratings" → extract number
      const numMatch = text.replace(/,/g, "").match(/(\d+)/);
      if (numMatch) reviewCount = parseInt(numMatch[1], 10);
    }
  }

  return { rating, reviewCount };
}

function findByStructure(card: Element, type: string): Element | null {
  if (type === "title-grid") {
    // In grid layout, title is typically the second <a> inside the card
    const links = card.querySelectorAll("a[href*='/p/']");
    for (const link of links) {
      const text = link.textContent?.trim() || "";
      if (text.length > 10 && text.length < 200) return link;
    }
  }
  if (type === "title-list") {
    // In list layout, title is a div near the top of the info section
    const divs = card.querySelectorAll("div");
    for (const div of divs) {
      const text = div.textContent?.trim() || "";
      if (
        text.length > 10 &&
        text.length < 200 &&
        !text.includes("₹") &&
        !text.includes("off")
      ) {
        // Avoid price/discount containers
        if (div.children.length === 0) return div;
      }
    }
  }
  return null;
}

// --- Filter application ---

async function tryCheckboxFilter(filter: Filter): Promise<boolean> {
  // Flipkart uses div[title="<value>"] for checkbox filter items
  const value = filter.value;

  // Strategy A: Match by title attribute (most reliable)
  const items = document.querySelectorAll(`div[title]`);
  for (const item of items) {
    const title = item.getAttribute("title") || "";
    if (titleMatchesFilter(title, filter)) {
      // Click the checkbox or label inside
      const checkbox = item.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      if (checkbox) {
        const label = item.querySelector("label");
        if (label) {
          label.click();
        } else {
          checkbox.click();
        }
        await sleep(500);
        return true;
      }
      // Fallback: click the item itself
      (item as HTMLElement).click();
      await sleep(500);
      return true;
    }
  }

  // Strategy B: Match by label text content
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    const text = label.textContent?.trim() || "";
    if (titleMatchesFilter(text, filter)) {
      label.click();
      await sleep(500);
      return true;
    }
  }

  return false;
}

function titleMatchesFilter(title: string, filter: Filter): boolean {
  const value = filter.value.toLowerCase();
  const titleLower = title.toLowerCase();

  // Direct match
  if (titleLower === value) return true;

  // Brand: case-insensitive
  if (filter.type === "brand") {
    return titleLower === value;
  }

  // Rating: "4★ & up" → "4★ & above"
  if (filter.type === "rating") {
    const num = value.match(/(\d)/);
    if (num) {
      if (titleLower.includes(`${num[1]}★`) && titleLower.includes("above"))
        return true;
      if (titleLower.includes(`${num[1]} star`) && titleLower.includes("above"))
        return true;
    }
  }

  // Color: direct match
  if (filter.type === "color" || filter.type === "colour") {
    return titleLower === value || titleLower.includes(value);
  }

  // Size: direct match
  if (filter.type === "size") {
    return titleLower === value;
  }

  // Delivery: map to Flipkart's terminology
  if (filter.type === "delivery") {
    if (value.includes("prime") || value.includes("fast")) {
      return titleLower.includes("flipkart assured");
    }
  }

  // Discount
  if (filter.type === "discount") {
    return titleLower.includes("off") || titleLower.includes("discount");
  }

  return false;
}

async function tryPriceFilter(filter: Filter): Promise<boolean> {
  const priceNum = extractPriceNumber(filter.value);
  if (priceNum === null) return false;

  // Flipkart price filter uses <select> dropdowns
  const selects = document.querySelectorAll("select");
  if (selects.length < 2) return false;

  // Find the max price select (second select in the price section)
  // Try to set max price
  for (let i = 0; i < selects.length; i++) {
    const options = selects[i].querySelectorAll("option");
    for (const option of options) {
      const optText = option.textContent?.replace(/[₹,\s+]/g, "") || "";
      const optNum = parseInt(optText, 10);
      if (!isNaN(optNum) && optNum === priceNum) {
        selects[i].value = option.value;
        selects[i].dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(500);
        // Click the "Go" button if present
        const goBtn = document.querySelector(
          'button[type="submit"], input[type="submit"]',
        );
        if (goBtn) (goBtn as HTMLElement).click();
        return true;
      }
    }
  }

  // Fallback: apply price via URL parameter
  const url = new URL(window.location.href);
  url.searchParams.set(
    "p[]",
    `facets.price_range.from=Min&facets.price_range.to=${priceNum}`,
  );
  window.location.href = url.toString();
  return true;
}

function extractPriceNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

async function tryTextFallback(filter: Filter): Promise<boolean> {
  // Last resort: find any clickable element with matching text in the sidebar
  const sidebar = document.querySelector('div[class*="col-2-12"]');
  if (!sidebar) return false;

  const value = filter.value.toLowerCase();
  const clickables = sidebar.querySelectorAll(
    "a, label, div[cursor='pointer']",
  );
  for (const el of clickables) {
    const text = (el as HTMLElement).textContent?.trim().toLowerCase() || "";
    if (
      text === value ||
      (text.includes(value) && text.length < value.length + 20)
    ) {
      (el as HTMLElement).click();
      await sleep(500);
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
