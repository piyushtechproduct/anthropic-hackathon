from enum import Enum

from pydantic import BaseModel


class IntentRequest(BaseModel):
    prompt: str


class Filter(BaseModel):
    type: str
    value: str


class IntentResponse(BaseModel):
    raw_query: str
    search_url: str
    filters: list[Filter]


class Platform(str, Enum):
    AMAZON = "amazon"
    FLIPKART = "flipkart"


class PlatformIntent(BaseModel):
    platform: Platform
    search_url: str
    filters: list[Filter]


class MultiPlatformIntentResponse(BaseModel):
    raw_query: str
    platforms: list[PlatformIntent]


class Product(BaseModel):
    title: str
    price: float
    rating: float | None
    review_count: int | None
    image_url: str
    product_url: str
    platform: str


class RankRequest(BaseModel):
    query: str
    products: list[Product]


class RankResponse(BaseModel):
    ranked_products: list[Product]
