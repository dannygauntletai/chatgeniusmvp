from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from openai import AsyncOpenAI
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
from langchain_core.documents import Document
from langchain_pinecone import PineconeVectorStore
import logging
from datetime import datetime
from models import Message, AssistantResponse, RetrieveRequest, RetrieveResponse
import json
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from utils import get_prisma
from routers.vector import retrieve_similar_messages

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Constants
ASSISTANT_BOT_USER_ID = os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot")

# Initialize components
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings()
langsmith_client = Client()

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

@router.post("/chat", response_model=AssistantResponse)
async def chat(
    message: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    thread_id: Optional[str] = Body(None),
    channel_type: str = Body(...),
    username: str = Body(...)
):
    """Process a chat message and return an AI response."""
    try:
        with tracing_v2_enabled() as tracer:
            print(f"\n=== ASSISTANT SERVICE CHAT ENDPOINT CALLED ===")
            print(f"Message: {message}")
            print(f"Channel: {channel_id}")
            print(f"User: {user_id}")
            print(f"Thread: {thread_id}")
            
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
            completion = await client.chat.completions.create(
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