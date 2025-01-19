from pydantic import BaseModel, validator
from typing import List, Optional, Dict, Any
from constants import CHANNEL_TYPES

class Message(BaseModel):
    message_id: str
    channel_name: str
    sender_name: str
    content: str
    similarity: float
    metadata: Optional[Dict[str, Any]] = None

class InitializeResponse(BaseModel):
    message: str
    total_messages: int
    vectors_created: int
    index_name: str

class RetrieveRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    channel_id: str
    channel_type: str
    top_k: int = 20
    threshold: float = 0.01

class RetrieveResponse(BaseModel):
    query: str
    messages: List[Message]

class VectorUpdateRequest(BaseModel):
    channel_id: str
    channel_type: str
    user_id: str
    content: str
    sender_name: str

    @validator('channel_type')
    def validate_channel_type(cls, v):
        if v not in CHANNEL_TYPES.values():
            raise ValueError(f'channel_type must be one of: {list(CHANNEL_TYPES.values())}')
        return v

class UserMessagesRequest(BaseModel):
    user_id: str
    top_k: int = 100
    query: Optional[str] = ""  # Optional query for filtering messages
    sender_name: Optional[str] = None  # Optional sender name for additional filtering

class ChannelMessagesRequest(BaseModel):
    channel_id: str
    query: str
    top_k: int = 100

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