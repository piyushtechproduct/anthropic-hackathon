"""
Tests for intent extraction endpoint
"""
import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from src.app.main import app
from src.app.models import IntentResponse, Filter


@pytest.mark.asyncio
@patch("src.app.services.client")
async def test_intent_extraction(mock_client):
    """Test intent extraction with mocked Anthropic API"""
    # Mock Anthropic API response
    mock_response = MagicMock()
    mock_response.content = [
        MagicMock(
            text='{"raw_query": "nike tshirt", "search_url": "https://www.amazon.in/s?k=nike+tshirt", "filters": [{"type": "brand", "value": "Nike"}, {"type": "price", "value": "Under ₹500"}]}'
        )
    ]
    mock_client.messages.create.return_value = mock_response

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/intent",
            json={"prompt": "white nike tshirt under 500 fast delivery"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "search_url" in data
        assert "filters" in data
        assert "raw_query" in data
        assert "amazon.in" in data["search_url"]
        assert len(data["filters"]) > 0


@pytest.mark.asyncio
async def test_intent_extraction_missing_prompt():
    """Test that missing prompt returns 422 validation error"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/intent", json={})
        assert response.status_code == 422  # Unprocessable Entity
