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
from routers.vector import retrieve_similar_user_messages, retrieve_similar_channel_messages, UserMessagesRequest, ChannelMessagesRequest, retrieve_similar_messages
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from utils import get_prisma
from clients.phone_client import PhoneServiceClient
import logging
from datetime import datetime
import asyncio
from pydantic import BaseModel

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Constants
ASSISTANT_BOT_USER_ID = os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot")
ASSISTANT_SERVICE_URL = os.getenv("ASSISTANT_SERVICE_URL", "http://localhost:8000")
MODEL_NAME = "gpt-4-turbo-preview"
MAX_TOKENS = 1024  # Response token limit
MAX_CONTEXT_TOKENS = 8192  # Increased for detailed document analysis
MAX_CHUNK_TOKENS = 512  # Increased for larger document chunks
TEMPERATURE = 0.7
SIMILARITY_THRESHOLD = 0.3  # More lenient similarity threshold for document retrieval
TOP_K = 10  # Increased to get more context from documents

class AssistantManager:
    def __init__(self, client: AsyncOpenAI):
        self.client = client
        self.phone_client = PhoneServiceClient()
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self, 'phone_client'):
            await self.phone_client.close()

    async def analyze_user_style(self, messages: List[Dict[str, Any]]) -> str:
        """Analyze a user's communication style from their messages."""
        try:
            messages_text = "\n".join([msg["content"] for msg in messages])
            completion = await self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "Analyze the following messages and describe the user's communication style. Focus on tone, vocabulary, common phrases, and patterns. Be specific and detailed."
                    },
                    {
                        "role": "user",
                        "content": f"Here are the messages:\n{messages_text}"
                    }
                ],
                temperature=0.7,
                max_tokens=500
            )
            return completion.choices[0].message.content
        except Exception as e:
            logging.error(f"Error analyzing user style: {str(e)}")
            return "Unable to analyze user style"

    async def generate_impersonated_response(
        self,
        message: str,
        username: str,
        style_description: str,
        recent_messages: List[Dict[str, Any]]
    ) -> str:
        """Generate a response as if from the user being impersonated."""
        try:
            # Format recent messages for context
            conversation = "\n".join([
                f"{'You' if msg['role'] == 'user' else 'Other person'}: {msg['content']}"
                for msg in recent_messages[-5:]  # Last 5 messages for immediate context
            ])

            completion = await self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": f"""You are now {username}. This is not a roleplay - you ARE this person.

Communication style:
{style_description}

Recent messages for context:
{conversation}

Important: Never acknowledge being AI, never apologize, never explain. Simply BE the person and respond exactly as they would."""
                    },
                    {
                        "role": "user",
                        "content": message
                    }
                ],
                temperature=0.9,  # Slightly higher for more creative responses
                max_tokens=MAX_TOKENS
            )
            return completion.choices[0].message.content
        except Exception as e:
            logging.error(f"Error generating impersonated response: {str(e)}")
            raise

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
                {
                    "role": "system",
                    "content": f"""You are ChatGenius, a helpful and engaging AI assistant. You help users by providing direct, actionable responses based on available context and knowledge.

Here is relevant context that may help with the response:
{context}

Important guidelines:
1. Be direct and helpful in your responses
2. If answering questions, provide clear, specific answers
3. If the user shares something, engage naturally and supportively
4. Use context when relevant, but don't analyze or comment on the conversation itself
5. Stay focused on being helpful rather than observing or analyzing
6. Never apologize or mention being an AI - just be helpful"""
                },
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

class FilterBuilder:
    @staticmethod
    def build_filter(channel_type: str, channel_id: str = None, target_username: str = None, user_id: str = None) -> Dict:
        """Build filter dictionary based on channel type and user access."""
        filter_dict = {}
        
        if channel_type == "user_query":
            # For user-specific queries, only get messages from that user
            filter_dict = {
                "user_id": user_id
            }
        elif channel_type == "assistant":
            filter_dict = {
                "$or": [
                    {"channel_type": "public"},
                    {"channel_type": "private"}
                ]
            }
        elif channel_type == "private":
            filter_dict = {
                "$or": [
                    {"channel_type": "public"},
                    {"channel_id": channel_id}
                ]
            }
        else:
            filter_dict = {
                "channel_type": "public"
            }

        if target_username and channel_type != "user_query":
            if "$or" in filter_dict:
                for condition in filter_dict["$or"]:
                    condition["sender_name"] = target_username
            else:
                filter_dict["sender_name"] = target_username

        return filter_dict

class OfflineRequest(BaseModel):
    query: str
    sender_name: Optional[str] = None
    limit: int = 100

class SummarizeRequest(BaseModel):
    query: str
    limit: int = 100

# Initialize components
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
assistant_manager = AssistantManager(openai_client)

@router.post("/chat", response_model=AssistantResponse)
async def chat(
    message: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    channel_type: str = Body(...),
    thread_id: Optional[str] = Body(None),
    username: str = Body(...)
):
    """Generate a response to a chat message."""
    try:
        # Check if this is a phone call request
        is_call, call_details = await assistant_manager.phone_client.extract_call_details(
            message,
            {"channel_id": channel_id, "user_id": user_id}
        )
        
        if is_call:
            # Handle phone call
            call_response = await assistant_manager.phone_client.make_call(
                call_details["phone_number"],
                call_details["message"],
                channel_id=channel_id,
                user_id=user_id,
                thread_id=thread_id
            )
            return AssistantResponse(
                response="I'll make that call for you right away.",
                context_used=[],
                confidence=1.0,
                rich_content=RichContent(
                    type="call",
                    content="Call initiated",
                    metadata={
                        "call_sid": call_response.call_sid,
                        "phone_number": call_details["phone_number"],
                        "message": call_details["message"]
                    }
                )
            )

        # Get similar messages for context
        retrieve_response = await retrieve_similar_messages(
            RetrieveRequest(
                query=message,
                channel_id=channel_id,
                user_id=user_id,
                channel_type=channel_type,
                top_k=TOP_K,
                threshold=SIMILARITY_THRESHOLD
            )
        )

        # Build context with metadata from the most recent relevant message
        channel_info = None
        if retrieve_response.messages:
            latest_msg = retrieve_response.messages[0]
            channel_info = {
                "name": latest_msg.channel_name,
                "id": latest_msg.channel_id,
                "type": latest_msg.channel_type
            }

        context = f"""You are ChatGenius, a helpful AI assistant. You help users by providing accurate and relevant information based on the conversation history.

Current conversation metadata:
- Channel: #{channel_info["name"] if channel_info else 'unknown'} ({channel_id})
- Channel type: {channel_info["type"] if channel_info else channel_type}
- Current user: @{username} ({user_id})
- Thread: {'In a thread' if thread_id else 'Not in a thread'}

Be direct and helpful in your responses. You can reference the channel and user information above when relevant to the conversation.\n\n"""
        
        if retrieve_response.messages:
            context += "Here are some relevant previous messages that might help with context:\n"
            for msg in retrieve_response.messages[:TOP_K]:
                context += f"{msg.sender_name}: {msg.content}\n"
            context += "\n"
            
        # Truncate context if it's too long
        if len(context) > MAX_CONTEXT_TOKENS * 4:
            context = context[:MAX_CONTEXT_TOKENS * 4] + "...\n[Context truncated for length]"
        
        # Generate response
        completion = await openai_client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": context},
                {"role": "user", "content": message}
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS
        )
        
        response = completion.choices[0].message.content
        
        return AssistantResponse(
            response=response,
            context_used=retrieve_response.messages,
            confidence=0.9,
            rich_content=RichContent(
                type="chat",
                content=response,
                metadata={
                    "channel": channel_info or {
                        "id": channel_id,
                        "type": channel_type
                    },
                    "user": {
                        "id": user_id,
                        "username": username
                    },
                    "thread_id": thread_id
                }
            )
        )
        
    except Exception as e:
        logging.error(f"Error in chat endpoint: {str(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            logging.error(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/call-status")
async def c(
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

@router.post("/summarize/{channel_id}", response_model=AssistantResponse)
async def summarize_channel(
    channel_id: str,
    request: SummarizeRequest
):
    """Generate a summary or answer questions about a specific channel using vector search."""
    try:
        # Get messages from vector store
        retrieve_response = await retrieve_similar_channel_messages(
            ChannelMessagesRequest(
                channel_id=channel_id,
                query=request.query,
                top_k=request.limit
            )
        )

        if not retrieve_response.messages:
            return AssistantResponse(
                response="No messages found in this channel.",
                context_used=[],
                confidence=0.0
            )

        # Build context from messages
        context = await assistant_manager.build_context(retrieve_response.messages)
        
        # Generate summary/response
        completion = await openai_client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": f"""You are analyzing a chat channel. Your task is to provide a detailed response based on the channel's content.
The query is: {request.query}

Here is the relevant content from the channel:
{context}

Important:
1. Be specific and reference actual content from the messages
2. If summarizing, organize by key topics or themes
3. If answering a question, cite relevant messages
4. Don't apologize or mention being an AI - just provide the information
5. If the context seems insufficient, mention what additional information would be helpful"""
                }
            ],
            temperature=0.3,  # Lower temperature for more factual responses
            max_tokens=MAX_TOKENS
        )

        return AssistantResponse(
            response=completion.choices[0].message.content,
            context_used=retrieve_response.messages,
            confidence=0.9
        )

    except Exception as e:
        logging.error(f"Error in summarize endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 

@router.post("/offline/{user_id}", response_model=AssistantResponse)
async def get_offline_user_messages(
    user_id: str,
    request: OfflineRequest
):
    """Retrieve and analyze messages from a specific offline user."""
    try:
        # Get messages from vector store with user-specific filter
        print("user_id", user_id)
        retrieve_response = await retrieve_similar_user_messages(
            UserMessagesRequest(user_id=user_id, top_k=request.limit)
        )

        print(retrieve_response)

        if not retrieve_response.messages:
            return AssistantResponse(
                response=f"No messages found for this user.",
                context_used=[],
                confidence=0.0
            )

        # Build context from messages
        context = await assistant_manager.build_context(retrieve_response.messages)
        
        # Get user info
        prisma = get_prisma()
        user = await prisma.user.find_unique(
            where={"id": user_id}
        )
        username = user.username if user else "Unknown User"
        
        # Generate analysis/response
        completion = await openai_client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": f"""You are analyzing messages from user {username}. Your task is to provide one response to {request.query} that sounds like them based on their message history.

Here is their message history:
{context}

Important:
1. Be specific and reference actual messages when possible
2. Focus on patterns, preferences, and communication style
3. If answering a specific question, cite relevant messages
4. Don't apologize or mention being an AI - just provide the information
5. If the context seems insufficient, mention what additional information would be helpful"""
                }
            ],
            temperature=0.3,  # Lower temperature for more factual responses
            max_tokens=MAX_TOKENS
        )

        return AssistantResponse(
            response=completion.choices[0].message.content,
            context_used=retrieve_response.messages,
            confidence=0.9
        )

    except Exception as e:
        logging.error(f"Error in offline user endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 