from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class Message(BaseModel):
    message_id: str
    channel_name: str
    sender_name: str
    content: str
    similarity: float

class InitializeResponse(BaseModel):
    message: str
    total_messages: int
    vectors_created: int
    index_name: str

class RetrieveRequest(BaseModel):
    query: str
    channel_id: str
    user_id: str
    channel_type: str
    top_k: int = 5
    threshold: float = 0.7

class RetrieveResponse(BaseModel):
    query: str
    messages: List[Message]

class ProcessDocumentResponse(BaseModel):
    message: str
    file_name: str
    chunks_created: int

class CallResponse(BaseModel):
    message: str
    call_sid: str

class TranscriptionResponse(BaseModel):
    message: str
    response: str

class AssistantResponse(BaseModel):
    response: str
    context_used: List[Message]
    confidence: float

class FileObject(BaseModel):
    id: str
    name: str
    url: str
    type: str
    size: int
    createdAt: str
    updatedAt: str
    channelId: str
    userId: str
    user: Optional[Dict[str, Any]] = None
    channel: Optional[Dict[str, Any]] = None 