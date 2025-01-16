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
    user_id: str
    channel_id: str
    channel_type: str
    top_k: int = 20
    threshold: float = 0.1

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
    recording: Optional[Dict[str, Any]] = None

class TranscriptionResponse(BaseModel):
    message: str
    response: str

class CallRecording(BaseModel):
    url: str
    duration: int
    status: str
    recording_sid: str

class RichContent(BaseModel):
    type: str  # "text", "audio", etc.
    content: str
    metadata: Optional[Dict[str, Any]] = None

class AssistantResponse(BaseModel):
    response: str
    context_used: List[Message]
    confidence: float
    rich_content: Optional[RichContent] = None

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