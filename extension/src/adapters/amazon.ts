/**
 * Amazon India Adapter - Real Implementation
 * Extracts products and applies filters on amazon.in
 */

import type { PlatformAdapter } from './types';
import type { Filter, Product } from '../types';

export class AmazonAdapter implements PlatformAdapter {
  platformName: 'amazon' = 'amazon';

  async waitForFilters(): Promise<boolean> {
    console.log('[Amazon] Waiting for filters sidebar...');

    // Poll for #s-refinements element (filter sidebar)
    for (let i = 0; i < 20; i++) {
      const sidebar = document.querySelector('#s-refinements');
      if (sidebar) {
        console.log('[Amazon] Filters sidebar found');
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.warn('[Amazon] Filters sidebar not found after 10 seconds');
    return false;
  }

  async applyOneFilter(filter: Filter): Promise<boolean> {
    console.log('[Amazon] Applying filter:', filter);

    // Try 4 strategies in order
    const strategies = [
      () => this.tryAriaLabelMatch(filter),
      () => this.tryScopedSectionMatch(filter),
      () => this.tryFullSidebarScan(filter),
      () => this.tryExpandAndRetry(filter)
    ];

    for (const strategy of strategies) {
      const success = await strategy();
      if (success) {
        console.log('[Amazon] Filter applied successfully');
        return true;
      }
    }

    console.warn('[Amazon] Could not apply filter:', filter);
    return false;
  }

  async extractProducts(count: number): Promise<Product[]> {
    console.log('[Amazon] Extracting products...');

    const products: Product[] = [];

    // Select product cards
    const productCards = document.querySelectorAll('div[data-component-type="s-search-result"]');
    console.log(`[Amazon] Found ${productCards.length} product cards`);

    for (const card of Array.from(productCards)) {
      if (products.length >= count) break;

      try {
        // Skip sponsored results
        const link = card.querySelector('a[href]');
        if (link && link.getAttribute('href')?.includes('/sspa/')) {
          console.log('[Amazon] Skipping sponsored result');
          continue;
        }

        const product = this.extractProductFromCard(card as HTMLElement);
        if (product) {
          products.push(product);
        }
      } catch (error) {
        console.warn('[Amazon] Failed to extract product:', error);
      }
    }

    console.log(`[Amazon] Extracted ${products.length} products`);
    return products;
  }

  // Strategy 1: Match by aria-label
  private async tryAriaLabelMatch(filter: Filter): Promise<boolean> {
    const sidebar = document.querySelector('#s-refinements');
    if (!sidebar) return false;

    let targetText: string | null = null;

    switch (filter.type) {
      case 'brand':
        // Match "apply the filter <brand> to narrow results"
        targetText = filter.value.toLowerCase();
        break;
      case 'rating':
        // Match "X stars & up"
        targetText = filter.value.toLowerCase();
        break;
      case 'delivery':
        // Match "get it today", "get it by tomorrow", "free shipping"
        if (filter.value.toLowerCase().includes('prime')) {
          targetText = 'prime';
        }
        break;
    }

    if (!targetText) return false;

    const links = sidebar.querySelectorAll('a[aria-label]');
    for (const link of Array.from(links)) {
      const ariaLabel = link.getAttribute('aria-label')?.toLowerCase() || '';
      if (ariaLabel.includes(targetText)) {
        (link as HTMLElement).click();
        return true;
      }
    }

    return false;
  }

  // Strategy 2: Match within known section IDs
  private async tryScopedSectionMatch(filter: Filter): Promise<boolean> {
    const sectionIds: Record<string, string[]> = {
      brand: ['brandsRefinements', 'p_89'],
      delivery: ['deliveryRefinements'],
      rating: ['reviewsRefinements'],
      size: ['sizeRefinements', 'size_two_browse'],
      discount: ['pct-off']
    };

    const ids = sectionIds[filter.type];
    if (!ids) return false;

    for (const id of ids) {
      const section = document.getElementById(id);
      if (!section) continue;

      const links = section.querySelectorAll('a');
      for (const link of Array.from(links)) {
        const text = link.textContent?.trim().toLowerCase() || '';
        const filterValue = filter.value.toLowerCase();

        if (text.includes(filterValue) || filterValue.includes(text)) {
          (link as HTMLElement).click();
          return true;
        }
      }
    }

    return false;
  }

  // Strategy 3: Full sidebar scan
  private async tryFullSidebarScan(filter: Filter): Promise<boolean> {
    const sidebar = document.querySelector('#s-refinements');
    if (!sidebar) return false;

    const links = sidebar.querySelectorAll('a');
    const filterValue = filter.value.toLowerCase();

    for (const link of Array.from(links)) {
      const text = link.textContent?.trim().toLowerCase() || '';

      // Match filter value
      if (text.includes(filterValue) || filterValue.includes(text)) {
        (link as HTMLElement).click();
        return true;
      }
    }

    return false;
  }

  // Strategy 4: Expand "See more" and retry
  private async tryExpandAndRetry(filter: Filter): Promise<boolean> {
    const sidebar = document.querySelector('#s-refinements');
    if (!sidebar) return false;

    // Find and click "See more" buttons
    const seeMoreButtons = sidebar.querySelectorAll('span.a-expander-prompt');
    let expanded = false;

    for (const button of Array.from(seeMoreButtons)) {
      (button as HTMLElement).click();
      expanded = true;
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!expanded) return false;

    // Retry strategies 1-3
    return (
      (await this.tryAriaLabelMatch(filter)) ||
      (await this.tryScopedSectionMatch(filter)) ||
      (await this.tryFullSidebarScan(filter))
    );
  }

  // Extract product data from a card
  private extractProductFromCard(card: HTMLElement): Product | null {
    try {
      // Title
      const titleElem = card.querySelector('h2 a span, h2 span');
      const title = titleElem?.textContent?.trim();
      if (!title) return null;

      // Product URL
      const linkElem = card.querySelector('h2 a[href]');
      let productUrl = linkElem?.getAttribute('href') || '';
      if (productUrl.startsWith('/')) {
        productUrl = 'https://www.amazon.in' + productUrl;
      }
      if (!productUrl.includes('amazon.in')) return null;

      // Price
      const priceWhole = card.querySelector('.a-price-whole')?.textContent?.trim() || '0';
      const priceFraction = card.querySelector('.a-price-fraction')?.textContent?.trim() || '00';
      const priceText = priceWhole.replace(/,/g, '') + '.' + priceFraction;
      const price = parseFloat(priceText);
      if (!price || price === 0) return null;

      // Rating
      const ratingElem = card.querySelector('i.a-icon-star-small span, span.a-icon-alt');
      const ratingText = ratingElem?.textContent?.trim() || '0';
      const ratingMatch = ratingText.match(/([0-9.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

      // Review count
      const reviewElem = card.querySelector('span[aria-label*="stars"]')?.nextElementSibling;
      const reviewText = reviewElem?.textContent?.trim() || '0';
      const reviewCount = this.parseReviewCount(reviewText);

      // Image
      const imgElem = card.querySelector('img.s-image');
      const imageUrl = imgElem?.getAttribute('src') || '';

      return {
        title,
        price,
        rating,
        review_count: reviewCount,
        image_url: imageUrl,
        product_url: productUrl,
        platform: 'amazon'
      };
    } catch (error) {
      console.error('[Amazon] Failed to parse product card:', error);
      return null;
    }
  }

  // Parse review count (handles formats like "1,234", "12,345")
  private parseReviewCount(text: string): number {
    const cleaned = text.replace(/,/g, '').replace(/[^0-9]/g, '');
    return parseInt(cleaned) || 0;
  }
}
