"""
Pydantic models for request/response validation
"""
from enum import Enum
from typing import List
from pydantic import BaseModel, Field


class IntentRequest(BaseModel):
    """Request model for intent extraction"""
    prompt: str = Field(..., description="Natural language shopping query")


class Filter(BaseModel):
    """Filter constraint extracted from user intent"""
    type: str = Field(..., description="Filter type: price, brand, delivery, rating, color, size, discount")
    value: str = Field(..., description="Filter value")


class IntentResponse(BaseModel):
    """Single-platform intent extraction response"""
    search_url: str = Field(..., description="Amazon India search URL")
    filters: List[Filter] = Field(default_factory=list, description="List of filters to apply")
    raw_query: str = Field(..., description="Cleaned search query without filters")


class Platform(str, Enum):
    """Supported e-commerce platforms"""
    amazon = "amazon"
    flipkart = "flipkart"


class PlatformIntent(BaseModel):
    """Intent for a specific platform"""
    platform: Platform = Field(..., description="Platform name")
    search_url: str = Field(..., description="Platform-specific search URL")
    filters: List[Filter] = Field(default_factory=list, description="Platform-specific filters")


class MultiPlatformIntentResponse(BaseModel):
    """Multi-platform intent extraction response"""
    raw_query: str = Field(..., description="Cleaned search query")
    platforms: List[PlatformIntent] = Field(..., description="Per-platform intents")


class Product(BaseModel):
    """Product information extracted from search results"""
    title: str
    price: float
    rating: float
    review_count: int
    image_url: str
    product_url: str
    platform: str


class RankRequest(BaseModel):
    """Request model for product ranking"""
    query: str = Field(..., description="Original search query")
    products: List[Product] = Field(..., description="Products to rank")


class RankResponse(BaseModel):
    """Response model for product ranking"""
    ranked_products: List[Product] = Field(..., description="Products ranked by relevance")
