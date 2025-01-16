from fastapi import APIRouter, HTTPException, Body, Request
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
import httpx
from openai import AsyncOpenAI
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
from langchain_core.documents import Document
from langchain_pinecone import PineconeVectorStore
import json
from models import AssistantResponse, Message, RetrieveRequest, RichContent, RetrieveResponse
from routers.vector import retrieve_similar_messages
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from utils import get_prisma
from phone_client import PhoneServiceClient
import logging
from datetime import datetime
import asyncio

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Constants
ASSISTANT_BOT_USER_ID = os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot")
PHONE_SERVICE_URL = os.getenv("PHONE_SERVICE_URL", "http://localhost:8000")

# Initialize components
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings()
langsmith_client = Client()
phone_client = PhoneServiceClient()

async def update_vector_db(message_id: str):
    """Update the vector database with a new message."""
    try:
        print(f"\n=== UPDATE VECTOR DB CALLED ===")
        print(f"Attempting to update vector DB with message_id: {message_id}")
        
        prisma = get_prisma()
        print(f"Prisma client initialized")
        
        # Get message from database
        print(f"Attempting to find message with ID: {message_id}")
        message = await prisma.message.find_unique(
            where={"id": message_id},
            include={"user": True, "channel": True}
        )
        print(f"Database query result: {message}")
        
        if not message:
            print(f"Message not found in database: {message_id}")
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Skip messages containing @assistant
        if "@assistant" in message.content:
            print(f"Skipping message {message_id} - contains @assistant mention")
            return {"status": "skipped", "reason": "assistant mention"}
        
        print(f"Initializing vector store for message: {message_id}")
        # Initialize vector store
        vector_store = PineconeVectorStore(
            index_name="chatgenius-messages",
            embedding=embeddings,
            pinecone_api_key=os.getenv("PINECONE_API_KEY")
        )
        
        # Create document
        doc = Document(
            page_content=message.content,
            metadata={
                "message_id": message.id,
                "channel_id": message.channelId,
                "channel_name": message.channel.name if message.channel else None,
                "sender_name": message.user.username if message.user else None,
            }
        )
        print(f"Created document for vector store: {doc}")
        
        # Add to vector store
        print(f"Attempting to add document to vector store")
        await vector_store.aadd_documents([doc])
        print(f"Successfully added document to vector store")
        
        return {"status": "success"}
            
    except Exception as e:
        print(f"Error in update_vector_db: {str(e)}")
        print(f"Error type: {type(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update vector database: {str(e)}"
        )

async def handle_phone_call(message: str, channel_id: str, user_id: str, thread_id: Optional[str] = None) -> bool:
    """Handle potential phone call requests."""
    try:
        print(f"\n=== HANDLING PHONE CALL REQUEST ===")
        print(f"Message: {message}")
        print(f"Channel: {channel_id}")
        print(f"User: {user_id}")
        print(f"Thread: {thread_id}")
        
        # Extract call details with context
        async with httpx.AsyncClient(timeout=30.0) as http_client:  # Renamed to http_client
            print(f"Calling extract endpoint: {PHONE_SERVICE_URL}/phone/extract")
            response = await http_client.post(
                f"{PHONE_SERVICE_URL}/phone/extract",
                json={
                    "message": message,
                    "context": {
                        "channel_id": channel_id,
                        "user_id": user_id,
                        "thread_id": thread_id,
                        "channel_type": "private"  # Default to private for direct messages
                    }
                }
            )
            
            if response.status_code != 200:
                print(f"Error extracting call details: {response.text}")
                return False
                
            extract_data = response.json()
            print(f"Extract response: {extract_data}")
            
            if not extract_data["is_call_request"]:
                return False
                
            # Make the call with extracted details
            print(f"Initiating call to: {extract_data['phone_number']}")
            call_response = await http_client.post(
                f"{PHONE_SERVICE_URL}/phone/call",
                json={
                    "phone_number": extract_data["phone_number"],
                    "channel_id": channel_id,
                    "user_id": user_id,
                    "thread_id": thread_id,
                    "message": extract_data["message"]
                }
            )
            
            if call_response.status_code != 200:
                print(f"Error making call: {call_response.text}")
                return False
                
            print("Call initiated successfully")
            return True
            
    except Exception as e:
        print(f"Error handling phone call: {str(e)}")
        print(f"Error type: {type(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        return False

@router.post("/chat", response_model=AssistantResponse)
async def chat(
    message: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    channel_type: str = Body(...),
    username: str = Body(...),
    thread_id: Optional[str] = Body(None)  # Keep parameter but ignore it
):
    """Process a chat message and return an AI response."""
    try:
        with tracing_v2_enabled() as tracer:
            print(f"\n=== ASSISTANT SERVICE CHAT ENDPOINT CALLED ===")
            print(f"Message: {message}")
            print(f"Channel: {channel_id}")
            print(f"User: {user_id}")
            # Removed thread_id logging since we're ignoring it
        
            # Extract call details
            is_call_request, call_details = await phone_client.extract_call_details(
                message=message,
                context={"user_id": user_id, "channel_id": channel_id}
            )
            
            if is_call_request and call_details:
                # Make the call
                call_response = await phone_client.make_call(
                    to_number=call_details["phone_number"],
                    message=call_details["message"],
                    channel_id=channel_id,
                    user_id=user_id
                )
                
                # Wait for recording to be ready
                max_retries = 30  # 30 seconds timeout
                recording_url = None
                async with httpx.AsyncClient() as http_client:
                    for _ in range(max_retries):
                        recording_response = await http_client.get(
                            f"{PHONE_SERVICE_URL}/phone/recording/{call_response['call_sid']}"
                        )
                        if recording_response.status_code == 200:
                            recording_data = recording_response.json()
                            if recording_data.get("recording_url"):
                                recording_url = recording_data["recording_url"]
                                break
                        await asyncio.sleep(1)  # Wait 1 second before retrying
                
                return AssistantResponse(
                    response=recording_url if recording_url else "",
                    context_used=[],
                    confidence=1.0
                )

            # Create RetrieveRequest instance
            request = RetrieveRequest(
                query=message,
                channel_id=channel_id,
                user_id=ASSISTANT_BOT_USER_ID,
                channel_type=channel_type,
                top_k=5,
                threshold=0.7
            )
            
            # Get similar messages from vector store using direct function call
            retrieve_response = await retrieve_similar_messages(request)
            similar_messages = retrieve_response.messages
            
            # Build conversation context
            context = "You are ChatGenius, a helpful AI assistant. "
            context += "You help users by providing accurate and relevant information based on the conversation history. "
            context += "You can access and reference previous messages to provide context-aware responses. "
            context += "Always be professional, concise, and helpful.\n\n"
            
            if similar_messages:
                context += "Here are some relevant previous messages that might help with context:\n"
                for msg in similar_messages:
                    context += f"{msg.sender_name}: {msg.content}\n"
                context += "\n"
            
            # Create chat completion
            completion = await openai_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": context},
                    {"role": "user", "content": f"{username}: {message}"}
                ],
                temperature=0.7,
                max_tokens=1000,
                n=1
            )

            response = completion.choices[0].message.content
            
            return AssistantResponse(
                response=response,
                context_used=similar_messages,
                confidence=0.9  # TODO: Calculate actual confidence
            )
            
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
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
    """Handle call status and recording status updates."""
    try:
        print(f"\n=== CALL STATUS/RECORDING CALLBACK RECEIVED ===")
        print(f"Raw request data: {await request.json()}")
        print(f"Query parameters: {request.query_params}")
        print(f"Call SID: {CallSid}")
        print(f"Call Status: {CallStatus}")
        print(f"Recording SID: {RecordingSid}")
        print(f"Recording Status: {RecordingStatus}")
        print(f"Recording URL: {RecordingUrl}")
        print(f"Recording Duration: {RecordingDuration}")
        print(f"Channel ID: {ChannelId}")
        print(f"User ID: {UserId}")
        print(f"Account SID: {AccountSid}")
        
        # If this is a recording status callback and the recording is completed
        if RecordingSid and RecordingStatus == "completed" and RecordingUrl:
            print("Recording is complete, fetching details...")
            # Create a new message with the recording
            async with httpx.AsyncClient() as client:
                # First get the recording details from our phone service
                recording_response = await client.get(
                    f"{PHONE_SERVICE_URL}/phone/recording/{CallSid}"
                )
                print(f"Recording response status: {recording_response.status_code}")
                if recording_response.status_code == 200:
                    recording_data = recording_response.json()
                    print(f"Recording data: {recording_data}")
                    
                    # Create message with recording
                    message_response = await client.post(
                        f"{os.getenv('BACKEND_URL')}/api/messages/assistant",
                        json={
                            "content": recording_data["recording_url"],
                            "channelId": ChannelId,
                            "userId": ASSISTANT_BOT_USER_ID
                        }
                    )
                    print(f"Message creation response status: {message_response.status_code}")
                    print(f"Message creation response: {message_response.text}")
            return {"status": "success", "type": "recording"}
            
        # If this is a call status callback
        elif CallStatus:
            print(f"Call status update: {CallStatus}")
            if CallStatus == "completed":
                print("Call completed, waiting for recording callback")
                return {"status": "success", "type": "call"}
            else:
                print(f"Call in progress: {CallStatus}")
                return {"status": "pending", "type": "call"}
                
        return {"status": "unknown"}
        
    except Exception as e:
        print(f"Error in call status callback: {str(e)}")
        print(f"Error type: {type(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise HTTPException(status_code=500, detail=str(e)) 