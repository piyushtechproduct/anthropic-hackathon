/**
 * Flipkart Adapter - Real Implementation
 * Extracts products and applies checkbox-based filters on flipkart.com
 */

import type { PlatformAdapter } from './types';
import type { Filter, Product } from '../types';

export class FlipkartAdapter implements PlatformAdapter {
  platformName: 'flipkart' = 'flipkart';

  async waitForFilters(): Promise<boolean> {
    console.log('[Flipkart] Waiting for product grid...');

    // Poll for product grid (Flipkart uses various container classes)
    for (let i = 0; i < 20; i++) {
      const productGrid = document.querySelector('div._1YokD2, div._75nlfW, div[class*="DOjaWF"]');
      if (productGrid) {
        console.log('[Flipkart] Product grid found');
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.warn('[Flipkart] Product grid not found after 10 seconds');
    return false;
  }

  async applyOneFilter(filter: Filter): Promise<boolean> {
    console.log('[Flipkart] Applying filter:', filter);

    // Try multiple strategies in order
    const strategies = [
      () => this.tryCheckboxMatch(filter),
      () => this.tryDivLabelMatch(filter),
      () => this.tryExpandAndRetry(filter)
    ];

    for (const strategy of strategies) {
      const success = await strategy();
      if (success) {
        console.log('[Flipkart] Filter applied successfully');
        return true;
      }
    }

    console.warn('[Flipkart] Could not apply filter:', filter);
    return false;
  }

  async extractProducts(count: number): Promise<Product[]> {
    console.log('[Flipkart] Extracting products...');

    const products: Product[] = [];

    // Flipkart uses div[data-id] for product cards
    const productCards = document.querySelectorAll('div[data-id], div[class*="_1AtVbE"], div[class*="cPHDOP"]');
    console.log(`[Flipkart] Found ${productCards.length} product cards`);

    for (const card of Array.from(productCards)) {
      if (products.length >= count) break;

      try {
        // Skip ads (look for 'Ad' badge or sponsored indicators)
        const adBadge = card.querySelector('div._2BxJo8, div[class*="Ad"]');
        if (adBadge && adBadge.textContent?.toLowerCase().includes('ad')) {
          console.log('[Flipkart] Skipping ad result');
          continue;
        }

        const product = this.extractProductFromCard(card as HTMLElement);
        if (product) {
          products.push(product);
        }
      } catch (error) {
        console.warn('[Flipkart] Failed to extract product:', error);
      }
    }

    console.log(`[Flipkart] Extracted ${products.length} products`);
    return products;
  }

  // Strategy 1: Match checkboxes by label text
  private async tryCheckboxMatch(filter: Filter): Promise<boolean> {
    const filterValue = filter.value.toLowerCase();

    // Find all checkbox containers
    const checkboxSections = document.querySelectorAll('div._24_Dny, div[class*="filter"], section[class*="filter"]');

    for (const section of Array.from(checkboxSections)) {
      const labels = section.querySelectorAll('div, label, span');

      for (const label of Array.from(labels)) {
        const text = label.textContent?.trim().toLowerCase() || '';

        if (text.includes(filterValue) || filterValue.includes(text)) {
          // Find associated checkbox (could be sibling, parent, or child)
          const checkbox = this.findNearbyCheckbox(label as HTMLElement);
          if (checkbox && !checkbox.checked) {
            checkbox.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            return true;
          }
        }
      }
    }

    return false;
  }

  // Strategy 2: Match by div with class containing filter text
  private async tryDivLabelMatch(filter: Filter): Promise<boolean> {
    const filterValue = filter.value.toLowerCase();

    // Map filter types to Flipkart sections
    const sectionTitles: Record<string, string[]> = {
      brand: ['brand', 'brands'],
      rating: ['customer ratings', 'rating'],
      delivery: ['delivery', 'availability'],
      size: ['size'],
      discount: ['discount']
    };

    const titles = sectionTitles[filter.type] || [];

    for (const title of titles) {
      // Find section by title
      const sections = document.querySelectorAll('div._3879cV, div[class*="filter"], section');

      for (const section of Array.from(sections)) {
        const heading = section.querySelector('div, span, p');
        const headingText = heading?.textContent?.toLowerCase() || '';

        if (headingText.includes(title)) {
          // Look for divs or labels within this section
          const options = section.querySelectorAll('div, label, a');

          for (const option of Array.from(options)) {
            const text = option.textContent?.trim().toLowerCase() || '';

            if (text.includes(filterValue) || filterValue.includes(text)) {
              // Try to click the element
              (option as HTMLElement).click();
              await new Promise(resolve => setTimeout(resolve, 300));
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  // Strategy 3: Expand collapsed sections and retry
  private async tryExpandAndRetry(filter: Filter): Promise<boolean> {
    // Find "More" or "See all" buttons
    const expandButtons = document.querySelectorAll('div._2Z_t5a, div[class*="more"], div[class*="see-all"], span[class*="more"]');
    let expanded = false;

    for (const button of Array.from(expandButtons)) {
      const text = button.textContent?.toLowerCase() || '';
      if (text.includes('more') || text.includes('see all') || text.includes('+')) {
        (button as HTMLElement).click();
        expanded = true;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    if (!expanded) return false;

    // Retry strategies 1-2
    return (
      (await this.tryCheckboxMatch(filter)) ||
      (await this.tryDivLabelMatch(filter))
    );
  }

  // Helper: Find checkbox near a label element
  private findNearbyCheckbox(element: HTMLElement): HTMLInputElement | null {
    // Check as child
    let checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) return checkbox;

    // Check as sibling
    const parent = element.parentElement;
    if (parent) {
      checkbox = parent.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) return checkbox;
    }

    // Check as parent's previous sibling
    const prevSibling = element.previousElementSibling;
    if (prevSibling) {
      checkbox = prevSibling.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) return checkbox;
    }

    return null;
  }

  // Extract product data from a card
  private extractProductFromCard(card: HTMLElement): Product | null {
    try {
      // Title - multiple possible selectors
      const titleElem = card.querySelector('a[class*="_1fQZEK"], a[class*="IRpwTa"], div[class*="_4rR01T"]');
      const title = titleElem?.textContent?.trim();
      if (!title) return null;

      // Product URL
      const linkElem = card.querySelector('a[href*="/p/"]');
      let productUrl = linkElem?.getAttribute('href') || '';
      if (productUrl.startsWith('/')) {
        productUrl = 'https://www.flipkart.com' + productUrl;
      }
      if (!productUrl.includes('flipkart.com')) return null;

      // Price - Flipkart uses ₹ symbol
      const priceElem = card.querySelector('div[class*="_30jeq3"], div[class*="_3I9_wc"]');
      const priceText = priceElem?.textContent?.trim() || '0';
      const priceMatch = priceText.match(/[0-9,]+/);
      if (!priceMatch) return null;
      const price = parseFloat(priceMatch[0].replace(/,/g, ''));
      if (!price || price === 0) return null;

      // Rating
      const ratingElem = card.querySelector('div[class*="_3LWZlK"], div[class*="hGSR34"]');
      const ratingText = ratingElem?.textContent?.trim() || '0';
      const ratingMatch = ratingText.match(/([0-9.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

      // Review count - often in format "(1,234)" or "1,234 Ratings"
      const reviewElem = card.querySelector('span[class*="_2_R_DZ"], span[class*="ratings"]');
      const reviewText = reviewElem?.textContent?.trim() || '0';
      const reviewCount = this.parseReviewCount(reviewText);

      // Image
      const imgElem = card.querySelector('img[class*="_396cs4"], img[loading="eager"], img[loading="lazy"]');
      const imageUrl = imgElem?.getAttribute('src') || '';

      return {
        title,
        price,
        rating,
        review_count: reviewCount,
        image_url: imageUrl,
        product_url: productUrl,
        platform: 'flipkart'
      };
    } catch (error) {
      console.error('[Flipkart] Failed to parse product card:', error);
      return null;
    }
  }

  // Parse review count from text like "(1,234)" or "12,345 Ratings"
  private parseReviewCount(text: string): number {
    const cleaned = text.replace(/[(),]/g, '').replace(/[^0-9]/g, '');
    return parseInt(cleaned) || 0;
  }
}
