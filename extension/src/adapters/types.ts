import type { Filter, Product } from "../types";

export interface PlatformAdapter {
  platformName: "amazon" | "flipkart";
  waitForFilters(): Promise<boolean>;
  applyOneFilter(filter: Filter): Promise<boolean>;
  extractProducts(
    count: number,
    ratingMap?: Record<string, number>,
  ): Promise<Product[]>;
}
