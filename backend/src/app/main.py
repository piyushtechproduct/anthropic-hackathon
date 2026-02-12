from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from src.app.models import IntentRequest, IntentResponse  # noqa: E402
from src.app.services import extract_intent  # noqa: E402

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
