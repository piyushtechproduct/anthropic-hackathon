/**
 * Flipkart Adapter (Stub)
 * Will be implemented in Step 6-7
 */

import type { PlatformAdapter } from './types';
import type { Filter, Product } from '../types';

export class FlipkartAdapter implements PlatformAdapter {
  platformName: 'flipkart' = 'flipkart';

  async waitForFilters(): Promise<boolean> {
    // TODO: Wait for product cards or filters
    console.log('[Flipkart] Waiting for filters...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  }

  async applyOneFilter(filter: Filter): Promise<boolean> {
    // TODO: Implement checkbox-based filters
    console.log('[Flipkart] Applying filter:', filter);
    await new Promise(resolve => setTimeout(resolve, 500));
    return false; // Stub returns false
  }

  async extractProducts(count: number): Promise<Product[]> {
    // TODO: Extract from div[data-id] or a[href*='/p/']
    console.log('[Flipkart] Extracting products...');
    return []; // Stub returns empty array
  }
}
