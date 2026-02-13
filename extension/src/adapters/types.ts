/**
 * Platform Adapter Interface
 * Each e-commerce platform implements this interface
 */

import type { Filter, Product } from '../types';

export interface PlatformAdapter {
  platformName: 'amazon' | 'flipkart';

  /**
   * Wait for filter UI elements to be ready
   * Returns true when filters are available
   */
  waitForFilters(): Promise<boolean>;

  /**
   * Apply a single filter to the page
   * Returns true if filter was applied, false if not found
   */
  applyOneFilter(filter: Filter): Promise<boolean>;

  /**
   * Extract product information from search results
   * @param count - Maximum number of products to extract
   */
  extractProducts(count: number): Promise<Product[]>;
}
