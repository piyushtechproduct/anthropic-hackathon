/**
 * Shared TypeScript types for the Chrome Extension
 */

export interface Filter {
  type: string;  // price, brand, delivery, rating, color, size, discount
  value: string;
}

export interface Product {
  title: string;
  price: number;
  rating: number;
  review_count: number;
  image_url: string;
  product_url: string;
  platform: string;  // 'amazon' or 'flipkart'
}

export interface PlatformIntent {
  platform: string;  // 'amazon' or 'flipkart'
  search_url: string;
  filters: Filter[];
}

export interface MultiPlatformIntentResponse {
  raw_query: string;
  platforms: PlatformIntent[];
}

export interface RankResponse {
  ranked_products: Product[];
}

// Message types for communication between extension components
export type MessageType =
  | 'SEARCH_REQUEST'
  | 'STATUS'
  | 'PRODUCTS'
  | 'ERROR'
  | 'APPLY_ONE_FILTER'
  | 'EXTRACT_PRODUCTS';

export interface Message {
  type: MessageType;
  payload?: any;
}
