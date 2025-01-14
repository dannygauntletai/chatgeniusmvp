from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class Message(BaseModel):
    message_id: str
    channel_name: str
    sender_name: str
    content: str
    created_at: Optional[str] = None
    similarity: Optional[float] = None

class AssistantRequest(BaseModel):
    message: str
    channel_id: str
    user_id: str
    channel_type: str
    thread_id: Optional[str] = None

class AssistantResponse(BaseModel):
    response: str
    context_used: List[Message]
    confidence: float

class InitializeResponse(BaseModel):
    message: str
    total_messages: int
    vectors_created: int
    index_name: str

class RetrieveRequest(BaseModel):
    query: str
    user_id: str
    channel_id: str
    channel_type: str
    top_k: int = 5
    threshold: float = 0.3

class RetrieveResponse(BaseModel):
    query: str
    messages: List[Message]

class IndexStats(BaseModel):
    dimension: int
    index_fullness: float
    total_vector_count: int
    namespaces: dict 