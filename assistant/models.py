from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class Message(BaseModel):
    message_id: str
    channel_name: str
    sender_name: str
    content: str
    created_at: str
    similarity: float

class AssistantRequest(BaseModel):
    message: str
    channel_id: str
    user_id: str
    channel_type: Literal["public", "private", "dm", "assistant"]
    thread_id: Optional[str] = None

class AssistantResponse(BaseModel):
    response: str
    context_used: List[str]
    confidence: float

class RetrieveRequest(BaseModel):
    query: str
    user_id: str
    channel_id: str
    channel_type: Literal["public", "private", "dm", "assistant"]
    top_k: int = Field(default=5, ge=1, le=20)
    threshold: float = Field(default=0.7, ge=0, le=1)

class RetrieveResponse(BaseModel):
    query: str
    messages: List[Message]

class InitializeResponse(BaseModel):
    total_messages: int
    vectors_created: int
    index_name: str 