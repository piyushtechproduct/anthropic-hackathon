from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from src.app.models import (  # noqa: E402
    IntentRequest,
    IntentResponse,
    MultiPlatformIntentResponse,
    RankRequest,
    RankResponse,
)
from src.app.services import (  # noqa: E402
    extract_intent,
    extract_multi_platform_intent,
    rank_products,
)

app = FastAPI(title="AI Commerce Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/intent", response_model=IntentResponse)
async def intent(request: IntentRequest):
    try:
        return extract_intent(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intent/multi", response_model=MultiPlatformIntentResponse)
async def multi_intent(request: IntentRequest):
    try:
        return extract_multi_platform_intent(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/rank", response_model=RankResponse)
async def rank(request: RankRequest):
    try:
        ranked = rank_products(request.query, request.products)
        return RankResponse(ranked_products=ranked)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
