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
