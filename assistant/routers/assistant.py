from fastapi import APIRouter, HTTPException, Body, Request
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
import httpx
from openai import AsyncOpenAI
from pinecone import Pinecone
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_pinecone import PineconeVectorStore
import json
from models import AssistantResponse, Message, RetrieveRequest, RichContent, RetrieveResponse
from routers.vector import retrieve_similar_messages
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from utils import get_prisma
from clients.phone_client import PhoneServiceClient
import logging
from datetime import datetime
import asyncio

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Constants
ASSISTANT_BOT_USER_ID = os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot")
ASSISTANT_SERVICE_URL = os.getenv("ASSISTANT_SERVICE_URL", "http://localhost:8000")
MODEL_NAME = "gpt-4-turbo-preview"
MAX_TOKENS = 4096  # Response token limit
MAX_CONTEXT_TOKENS = 4096  # Increased for detailed document analysis
MAX_CHUNK_TOKENS = 4096  # Increased for larger document chunks
TEMPERATURE = 0.7
SIMILARITY_THRESHOLD = 0.3  # More lenient similarity threshold for document retrieval
TOP_K = 10  # Increased to get more context from documents

class AssistantManager:
    def __init__(self, client: AsyncOpenAI):
        self.client = client
        self.phone_client = PhoneServiceClient()

    async def generate_response(self, username: str, message: str, context: str) -> str:
        """Generate a response using the OpenAI API."""
        # For document analysis, we want to keep as much context as possible
        if len(context) > MAX_CONTEXT_TOKENS * 4:
            # Split context into chunks and summarize each chunk
            chunks = [context[i:i + MAX_CONTEXT_TOKENS * 4] for i in range(0, len(context), MAX_CONTEXT_TOKENS * 4)]
            summarized_chunks = []
            
            for chunk in chunks[:3]:  # Process up to 3 chunks to stay within limits
                try:
                    summary = await self.client.chat.completions.create(
                        model=MODEL_NAME,
                        messages=[
                            {"role": "system", "content": "Summarize this content while preserving key details and facts:"},
                            {"role": "user", "content": chunk}
                        ],
                        temperature=0.3,  # Lower temperature for more factual summaries
                        max_tokens=1000
                    )
                    summarized_chunks.append(summary.choices[0].message.content)
                except Exception as e:
                    logging.error(f"Error summarizing chunk: {str(e)}")
                    continue
            
            context = "\n\n".join(summarized_chunks) + "\n\n[Context was summarized for length]"
            
        completion = await self.client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": context},
                {"role": "user", "content": f"{username}: {message}"}
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS
        )
        return completion.choices[0].message.content

    async def build_context(self, similar_messages: List[Message]) -> str:
        """Build the context string for the assistant."""
        context = "You are ChatGenius, a helpful AI assistant specializing in detailed document analysis. "
        context += "You help users by providing comprehensive, accurate information from documents and conversation history. "
        context += "When answering questions about documents, include specific details, quotes, and references to support your answers. "
        context += "Be thorough but clear in your explanations.\n\n"
        
        if similar_messages:
            context += "Here are the relevant document sections and messages that might help with context:\n"
            total_chars = 0
            for msg in similar_messages[:TOP_K]:  # Include more messages for better context
                # For document chunks, preserve more content
                msg_chars = len(msg.content) + len(msg.sender_name) + 2
                
                if msg_chars > MAX_CHUNK_TOKENS * 4:
                    # For long chunks, try to preserve complete sentences
                    truncated_content = msg.content[:(MAX_CHUNK_TOKENS * 4) - len(msg.sender_name) - 20]
                    last_period = truncated_content.rfind('.')
                    if last_period > 0:
                        truncated_content = truncated_content[:last_period + 1]
                    context += f"{msg.sender_name}: {truncated_content}\n"
                    total_chars += len(truncated_content) + len(msg.sender_name) + 2
                else:
                    context += f"{msg.sender_name}: {msg.content}\n"
                    total_chars += msg_chars
                
                if total_chars > MAX_CONTEXT_TOKENS * 4:
                    context += "\n[Additional content available but truncated for length]\n"
                    break
            context += "\n"
        
        return context

    async def process_call_status(
        self,
        call_sid: str,
        call_status: str,
        recording_sid: str = None,
        recording_url: str = None,
        recording_duration: int = None,
        recording_status: str = None,
        channel_id: str = None,
        user_id: str = None
    ) -> Dict[str, str]:
        """Process call status updates and recordings."""
        try:
            # If this is a recording callback
            if recording_status:
                logging.info(f"Recording status update: {recording_status}")
                if recording_status == "completed":
                    logging.info(f"Recording completed: {recording_url}")
                    # Process recording if needed
                    return {"status": "success", "type": "recording"}
                else:
                    logging.info(f"Recording in progress: {recording_status}")
                    return {"status": "pending", "type": "recording"}
            
            # If this is a call status callback
            elif call_status:
                logging.info(f"Call status update: {call_status}")
                if call_status == "completed":
                    logging.info("Call completed, waiting for recording callback")
                    return {"status": "success", "type": "call"}
                else:
                    logging.info(f"Call in progress: {call_status}")
                    return {"status": "pending", "type": "call"}
            
            return {"status": "unknown"}
            
        except Exception as e:
            logging.error(f"Error processing call status: {str(e)}")
            if hasattr(e, '__traceback__'):
                import traceback
                logging.error(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
            raise

# Initialize components
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
assistant_manager = AssistantManager(openai_client)

@router.post("/chat", response_model=AssistantResponse)
async def chat(
    message: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    channel_type: str = Body(...),
    username: str = Body(...),
    thread_id: Optional[str] = Body(None)
):
    """Process a chat message and generate a response."""
    try:
        with tracing_v2_enabled():
            # Create RetrieveRequest instance
            request = RetrieveRequest(
                query=message,
                channel_id=channel_id,
                user_id=ASSISTANT_BOT_USER_ID,
                channel_type=channel_type,
                top_k=TOP_K,
                threshold=SIMILARITY_THRESHOLD
            )
            
            # Get similar messages from vector store
            retrieve_response = await retrieve_similar_messages(request)
            similar_messages = retrieve_response.messages
            
            # Build context and generate response
            context = await assistant_manager.build_context(similar_messages)
            response = await assistant_manager.generate_response(username, message, context)
            
            # Add source information to the response using a set to avoid duplicates
            if similar_messages:
                sources = set()
                for msg in similar_messages:
                    source = msg.sender_name
                    if hasattr(msg, 'channel_name') and msg.channel_name:
                        source += f" in {msg.channel_name}"
                    sources.add(source)
                
                if sources:
                    response += "\n\nSources used:"
                    for source in sorted(sources):  # Sort for consistent ordering
                        response += f"\n- {source}"
            
            return AssistantResponse(
                response=response,
                context_used=similar_messages,
                confidence=0.9  # TODO: Calculate actual confidence
            )
            
    except Exception as e:
        logging.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/call-status")
async def call_status_callback(
    request: Request,
    CallSid: str = Body(...),
    CallStatus: str = Body(None),
    RecordingSid: str = Body(None),
    RecordingUrl: str = Body(None),
    RecordingDuration: int = Body(None),
    RecordingStatus: str = Body(None),
    AccountSid: str = Body(None),
    ChannelId: str = Body(None),
    UserId: str = Body(None)
):
    """Handle call status and recording callbacks."""
    try:
        return await assistant_manager.process_call_status(
            call_sid=CallSid,
            call_status=CallStatus,
            recording_sid=RecordingSid,
            recording_url=RecordingUrl,
            recording_duration=RecordingDuration,
            recording_status=RecordingStatus,
            channel_id=ChannelId,
            user_id=UserId
        )
        
    except Exception as e:
        logging.error(f"Error in call status callback: {str(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            logging.error(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise HTTPException(status_code=500, detail=str(e)) 