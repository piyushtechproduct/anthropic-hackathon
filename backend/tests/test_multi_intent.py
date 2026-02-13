import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.app.main import app

MOCK_MULTI_RESPONSE = {
    "raw_query": "white nike tshirt",
    "platforms": [
        {
            "platform": "amazon",
            "search_url": "https://www.amazon.in/s?k=white+nike+tshirt",
            "filters": [
                {"type": "brand", "value": "Nike"},
                {"type": "price", "value": "Under ₹500"},
                {"type": "color", "value": "White"},
            ],
        },
        {
            "platform": "flipkart",
            "search_url": "https://www.flipkart.com/search?q=white+nike+tshirt",
            "filters": [
                {"type": "brand", "value": "Nike"},
                {"type": "price", "value": "Under ₹500"},
                {"type": "color", "value": "White"},
            ],
        },
    ],
}


@pytest.mark.asyncio
async def test_multi_intent_endpoint():
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps(MOCK_MULTI_RESPONSE))]

    with patch("src.app.services.anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/intent/multi",
                json={"prompt": "white nike tshirt under 500"},
            )

    assert response.status_code == 200
    data = response.json()
    assert "raw_query" in data
    assert "platforms" in data
    assert len(data["platforms"]) == 2
    assert data["platforms"][0]["platform"] == "amazon"
    assert data["platforms"][1]["platform"] == "flipkart"
    assert data["platforms"][0]["search_url"].startswith("https://www.amazon.in/s")
    assert data["platforms"][1]["search_url"].startswith(
        "https://www.flipkart.com/search"
    )
    assert len(data["platforms"][0]["filters"]) > 0


@pytest.mark.asyncio
async def test_multi_intent_has_both_platforms():
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps(MOCK_MULTI_RESPONSE))]

    with patch("src.app.services.anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/intent/multi",
                json={"prompt": "samsung phone"},
            )

    data = response.json()
    platforms = {p["platform"] for p in data["platforms"]}
    assert platforms == {"amazon", "flipkart"}
