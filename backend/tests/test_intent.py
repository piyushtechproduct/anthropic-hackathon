import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.app.main import app

MOCK_RESPONSE = {
    "raw_query": "white nike tshirt",
    "search_url": "https://www.amazon.in/s?k=white+nike+tshirt",
    "filters": [
        {"type": "brand", "value": "Nike"},
        {"type": "price", "value": "Under ₹500"},
        {"type": "delivery", "value": "Prime"},
    ],
}


@pytest.mark.asyncio
async def test_intent_endpoint():
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps(MOCK_RESPONSE))]

    with patch("src.app.services.anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/intent",
                json={"prompt": "white nike tshirt under 500 fast delivery"},
            )

    assert response.status_code == 200
    data = response.json()
    assert "search_url" in data
    assert "filters" in data
    assert "raw_query" in data
    assert data["search_url"].startswith("https://www.amazon.in/s")
    assert len(data["filters"]) > 0
