/**
 * Amazon India Adapter - Real Implementation
 * Extracts products and applies filters on amazon.in
 */

import type { PlatformAdapter } from './types';
import type { Filter, Product } from '../types';

export class AmazonAdapter implements PlatformAdapter {
  platformName: 'amazon' = 'amazon';

  async waitForFilters(): Promise<boolean> {
    console.log('[Amazon] Waiting for page to load...');
    console.log('[Amazon] Current URL:', window.location.href);

    // Wait for page to be in complete state
    for (let i = 0; i < 20; i++) {
      if (document.readyState === 'complete') {
        console.log('[Amazon] Page loaded (readyState: complete)');

        // Check for product cards (more important than filters)
        const productCards = document.querySelectorAll('div[data-component-type="s-search-result"], div[data-asin]');
        if (productCards.length > 0) {
          console.log(`[Amazon] Found ${productCards.length} product cards - ready to extract`);
          return true;
        }

        // Also check for filters sidebar
        const sidebar = document.querySelector('#s-refinements, div[id*="filter"], div.s-refinements');
        if (sidebar) {
          console.log('[Amazon] Filters sidebar found');
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.warn('[Amazon] Timeout waiting for page - will try to extract anyway');
    console.log('[Amazon] Document readyState:', document.readyState);
    console.log('[Amazon] Document body exists:', !!document.body);

    // Return true anyway to attempt extraction
    return true;
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
    console.log('[Amazon] Page URL:', window.location.href);
    console.log('[Amazon] Page title:', document.title);

    const products: Product[] = [];
    const seenUrls = new Set<string>(); // Deduplication

    // Multiple strategies for finding product cards
    let productCards: NodeListOf<Element>;

    // Strategy 1: Standard data attribute (most reliable)
    productCards = document.querySelectorAll('div[data-component-type="s-search-result"]');
    console.log(`[Amazon] Strategy 1: Found ${productCards.length} cards with data-component-type`);

    // Strategy 2: If no data-component-type, try by ASIN attribute
    if (productCards.length === 0) {
      productCards = document.querySelectorAll('div[data-asin]:not([data-asin=""])');
      console.log(`[Amazon] Strategy 2: Found ${productCards.length} cards with data-asin`);
    }

    // Strategy 3: If still nothing, try generic product containers
    if (productCards.length === 0) {
      productCards = document.querySelectorAll('div[class*="s-result-item"]:not([class*="AdHolder"])');
      console.log(`[Amazon] Strategy 3: Found ${productCards.length} cards with s-result-item class`);
    }

    // Strategy 4: Look for any divs with product links
    if (productCards.length === 0) {
      const allDivs = document.querySelectorAll('div');
      const divsWithProductLinks: Element[] = [];
      allDivs.forEach(div => {
        const link = div.querySelector('a[href*="/dp/"]');
        if (link) {
          divsWithProductLinks.push(div);
        }
      });
      productCards = divsWithProductLinks as any;
      console.log(`[Amazon] Strategy 4: Found ${productCards.length} divs containing /dp/ links`);
    }

    console.log(`[Amazon] Processing ${productCards.length} product containers`);

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
        if (product && !seenUrls.has(product.product_url)) {
          products.push(product);
          seenUrls.add(product.product_url);
        }
      } catch (error) {
        console.warn('[Amazon] Failed to extract product:', error);
      }
    }

    console.log(`[Amazon] Extracted ${products.length} unique products`);
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
      // Product URL (most reliable identifier) - try multiple selectors
      let productUrl = '';
      const linkSelectors = [
        'h2 a[href]',
        'a.a-link-normal[href*="/dp/"]',
        'a[href*="/dp/"]',
        'a.s-underline-link-text'
      ];

      for (const selector of linkSelectors) {
        const linkElem = card.querySelector(selector);
        if (linkElem) {
          productUrl = linkElem.getAttribute('href') || '';
          if (productUrl) break;
        }
      }

      if (!productUrl) return null;

      if (productUrl.startsWith('/')) {
        productUrl = 'https://www.amazon.in' + productUrl;
      }
      if (!productUrl.includes('amazon.in')) return null;

      // Title - try multiple selectors
      let title = '';
      const titleSelectors = [
        'h2 a span',
        'h2 span',
        'h2 a',
        'h2',
        'span.a-size-medium',
        'span.a-size-base-plus'
      ];

      for (const selector of titleSelectors) {
        const titleElem = card.querySelector(selector);
        if (titleElem) {
          title = titleElem.textContent?.trim() || '';
          if (title && title.length > 10) break; // Valid title should be longer
        }
      }

      if (!title) return null;

      // Price - try multiple strategies
      let price = 0;

      // Strategy 1: Standard whole + fraction
      const priceWhole = card.querySelector('.a-price-whole')?.textContent?.trim();
      const priceFraction = card.querySelector('.a-price-fraction')?.textContent?.trim();

      if (priceWhole) {
        const priceText = priceWhole.replace(/,/g, '') + '.' + (priceFraction || '00');
        price = parseFloat(priceText);
      }

      // Strategy 2: If no price found, scan for ₹ symbol
      if (!price || price === 0) {
        const priceContainer = card.querySelector('.a-price, span[class*="price"]');
        if (priceContainer) {
          const priceText = priceContainer.textContent || '';
          const priceMatch = priceText.match(/₹?\s*([0-9,]+)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(/,/g, ''));
          }
        }
      }

      // Strategy 3: Scan entire card text for ₹
      if (!price || price === 0) {
        const cardText = card.textContent || '';
        const priceMatch = cardText.match(/₹\s*([0-9,]+)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(/,/g, ''));
        }
      }

      // Allow products without price (might be "Currently unavailable")
      if (!price || price === 0) {
        console.log('[Amazon] Product has no price, using placeholder');
        price = 999; // Placeholder price
      }

      // Rating
      let rating = 0;
      const ratingSelectors = [
        'i.a-icon-star-small span',
        'span.a-icon-alt',
        'span[aria-label*="out of"]'
      ];

      for (const selector of ratingSelectors) {
        const ratingElem = card.querySelector(selector);
        if (ratingElem) {
          const ratingText = ratingElem.textContent?.trim() || ratingElem.getAttribute('aria-label') || '0';
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
        'span[aria-label*="stars"]',
        'span.a-size-base'
      ];

      for (const selector of reviewSelectors) {
        const reviewElem = card.querySelector(selector);
        if (reviewElem) {
          const sibling = reviewElem.nextElementSibling;
          if (sibling) {
            const reviewText = sibling.textContent?.trim() || '';
            reviewCount = this.parseReviewCount(reviewText);
            if (reviewCount > 0) break;
          }
        }
      }

      // Image
      let imageUrl = '';
      const imgElem = card.querySelector('img.s-image, img[data-image-latency]');
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
