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

    // Poll for product grid with multiple selector strategies
    for (let i = 0; i < 20; i++) {
      // Strategy 1: Look for product links
      const productLinks = document.querySelectorAll('a[href*="/p/"]');
      if (productLinks.length > 0) {
        console.log('[Flipkart] Product grid found (via product links)');
        return true;
      }

      // Strategy 2: Look for common container classes
      const productGrid = document.querySelector('div._1YokD2, div._75nlfW, div[class*="DOjaWF"], div[class*="_1AtVbE"]');
      if (productGrid) {
        console.log('[Flipkart] Product grid found (via container)');
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
    const seenUrls = new Set<string>(); // Deduplication

    // Multiple strategies for finding product cards
    let productCards: NodeListOf<Element>;

    // Strategy 1: div[data-id] (most reliable)
    productCards = document.querySelectorAll('div[data-id]');
    console.log(`[Flipkart] Strategy 1: Found ${productCards.length} cards with data-id`);

    // Strategy 2: If no data-id, look for product links
    if (productCards.length === 0) {
      const links = document.querySelectorAll('a[href*="/p/"]');
      console.log(`[Flipkart] Strategy 2: Found ${links.length} product links`);

      // Find parent containers of product links
      const containers = new Set<Element>();
      links.forEach(link => {
        // Go up 3-5 levels to find the product card container
        let parent = link.parentElement;
        for (let i = 0; i < 5; i++) {
          if (parent && (parent.tagName === 'DIV' || parent.tagName === 'ARTICLE')) {
            containers.add(parent);
            break;
          }
          parent = parent?.parentElement || null;
        }
      });
      productCards = document.querySelectorAll('dummy'); // Empty nodelist
      if (containers.size > 0) {
        productCards = Array.from(containers) as any;
      }
    }

    console.log(`[Flipkart] Processing ${productCards.length} product containers`);

    for (const card of Array.from(productCards)) {
      if (products.length >= count) break;

      try {
        // Skip ads
        const adBadge = card.querySelector('div._2BxJo8, div[class*="Ad"], span[class*="ad"]');
        if (adBadge && adBadge.textContent?.toLowerCase().includes('ad')) {
          console.log('[Flipkart] Skipping ad result');
          continue;
        }

        const product = this.extractProductFromCard(card as HTMLElement);
        if (product && !seenUrls.has(product.product_url)) {
          products.push(product);
          seenUrls.add(product.product_url);
        }
      } catch (error) {
        console.warn('[Flipkart] Failed to extract product:', error);
      }
    }

    console.log(`[Flipkart] Extracted ${products.length} unique products`);
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
      // Product URL (most reliable identifier)
      const linkElem = card.querySelector('a[href*="/p/"]');
      let productUrl = linkElem?.getAttribute('href') || '';
      if (!productUrl) return null;

      if (productUrl.startsWith('/')) {
        productUrl = 'https://www.flipkart.com' + productUrl;
      }
      if (!productUrl.includes('flipkart.com')) return null;

      // Title - try multiple selectors
      let title = '';
      const titleSelectors = [
        'a[class*="_1fQZEK"]',
        'a[class*="IRpwTa"]',
        'div[class*="_4rR01T"]',
        'a[title]',
        'div[class*="title"]'
      ];

      for (const selector of titleSelectors) {
        const elem = card.querySelector(selector);
        if (elem) {
          title = elem.textContent?.trim() || elem.getAttribute('title') || '';
          if (title) break;
        }
      }
      if (!title) return null;

      // Price - look for ₹ symbol anywhere in the card
      let price = 0;
      const priceSelectors = [
        'div[class*="_30jeq3"]',
        'div[class*="_3I9_wc"]',
        'div[class*="price"]'
      ];

      for (const selector of priceSelectors) {
        const elem = card.querySelector(selector);
        if (elem) {
          const priceText = elem.textContent?.trim() || '';
          const priceMatch = priceText.match(/₹?\s*([0-9,]+)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (price > 0) break;
          }
        }
      }

      // If no price selector worked, scan all text for ₹ pattern
      if (price === 0) {
        const cardText = card.textContent || '';
        const priceMatch = cardText.match(/₹\s*([0-9,]+)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(/,/g, ''));
        }
      }

      if (!price || price === 0) return null;

      // Rating - try multiple selectors
      let rating = 0;
      const ratingSelectors = [
        'div[class*="_3LWZlK"]',
        'div[class*="hGSR34"]',
        'span[class*="rating"]',
        'div[class*="rating"]'
      ];

      for (const selector of ratingSelectors) {
        const elem = card.querySelector(selector);
        if (elem) {
          const ratingText = elem.textContent?.trim() || '';
          const ratingMatch = ratingText.match(/([0-9.]+)/);
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
            if (rating > 0) break;
          }
        }
      }

      // Review count
      let reviewCount = 0;
      const reviewSelectors = [
        'span[class*="_2_R_DZ"]',
        'span[class*="ratings"]',
        'span[class*="review"]'
      ];

      for (const selector of reviewSelectors) {
        const elem = card.querySelector(selector);
        if (elem) {
          const reviewText = elem.textContent?.trim() || '';
          reviewCount = this.parseReviewCount(reviewText);
          if (reviewCount > 0) break;
        }
      }

      // Image - try multiple sources
      let imageUrl = '';
      const imgElem = card.querySelector('img');
      if (imgElem) {
        imageUrl = imgElem.getAttribute('src') ||
                   imgElem.getAttribute('data-src') ||
                   imgElem.getAttribute('srcset')?.split(' ')[0] || '';
      }

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
