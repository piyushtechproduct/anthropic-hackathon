export interface Filter {
  type: string;
  value: string;
}

export interface Product {
  title: string;
  price: number;
  rating: number | null;
  review_count: number | null;
  image_url: string;
  product_url: string;
  platform: string;
}

export interface PlatformIntent {
  platform: "amazon" | "flipkart";
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
