import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.app.main import app
from src.app.models import Product
from src.app.services import rank_products

SAMPLE_PRODUCTS = [
    {
        "title": f"Product {i}",
        "price": 100.0 + i * 50,
        "rating": 4.0 + (i % 3) * 0.3,
        "review_count": 100 + i * 20,
        "image_url": f"https://example.com/img{i}.jpg",
        "product_url": f"https://example.com/product{i}",
        "platform": "amazon" if i < 5 else "flipkart",
    }
    for i in range(10)
]


@pytest.mark.asyncio
async def test_rank_endpoint():
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps({"indices": [0, 2, 5, 7, 9]}))]

    with patch("src.app.services.anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic.return_value = mock_client

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/rank",
                json={"query": "white nike tshirt", "products": SAMPLE_PRODUCTS},
            )

    assert response.status_code == 200
    data = response.json()
    assert "ranked_products" in data
    assert len(data["ranked_products"]) == 5


@pytest.mark.asyncio
async def test_rank_endpoint_with_few_products():
    """When 5 or fewer products, return all without calling LLM."""
    few_products = SAMPLE_PRODUCTS[:3]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/rank",
            json={"query": "nike shoes", "products": few_products},
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data["ranked_products"]) == 3


def test_rank_deterministic_fallback():
    """When LLM fails, deterministic sort should still produce results."""
    products = [Product(**p) for p in SAMPLE_PRODUCTS]

    with patch("src.app.services.anthropic.Anthropic") as mock_anthropic:
        mock_anthropic.side_effect = Exception("API down")
        result = rank_products("tshirt", products)

    assert len(result) == 5
    # All results should be valid Product objects
    for p in result:
        assert p.title
        assert p.price > 0


def test_rank_invalid_indices_triggers_fallback():
    """When LLM returns invalid indices, fall back to deterministic sort."""
    products = [Product(**p) for p in SAMPLE_PRODUCTS]

    mock_message = MagicMock()
    mock_message.content = [
        MagicMock(text=json.dumps({"indices": [99, -1]}))  # invalid indices
    ]

    with patch("src.app.services.anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic.return_value = mock_client

        result = rank_products("tshirt", products)

    assert len(result) == 5
