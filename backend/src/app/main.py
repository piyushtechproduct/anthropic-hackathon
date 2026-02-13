"""
AI Commerce Agent - FastAPI Backend
"""
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .models import (
    IntentRequest,
    IntentResponse,
    MultiPlatformIntentResponse,
    RankRequest,
    RankResponse
)
from .services import extract_intent, extract_multi_platform_intent, rank_products

# Load environment variables
load_dotenv()

app = FastAPI(
    title="AI Commerce Agent",
    description="Backend API for AI-powered e-commerce shopping assistant",
    version="1.0.0"
)

# Configure CORS - allow all origins for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Chrome extension needs this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/api/intent", response_model=IntentResponse)
async def extract_shopping_intent(request: IntentRequest):
    """
    Extract shopping intent from natural language (single-platform: Amazon only).
    Legacy endpoint for backward compatibility.
    """
    try:
        return extract_intent(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intent extraction failed: {str(e)}")


@app.post("/api/intent/multi", response_model=MultiPlatformIntentResponse)
async def extract_multi_platform_shopping_intent(request: IntentRequest):
    """
    Extract shopping intent for multiple platforms (Amazon + Flipkart).
    """
    try:
        return extract_multi_platform_intent(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-platform intent extraction failed: {str(e)}")


@app.post("/api/rank", response_model=RankResponse)
async def rank_products_endpoint(request: RankRequest):
    """
    Rank products by relevance, value, and ratings.
    """
    try:
        ranked = rank_products(request.query, request.products)
        return RankResponse(ranked_products=ranked)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Product ranking failed: {str(e)}")
