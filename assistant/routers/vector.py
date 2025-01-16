from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.vectorstores import VectorStore
from langsmith import Client
import json
import logging
from datetime import datetime
from langchain_pinecone import PineconeVectorStore
from models import Message, InitializeResponse, RetrieveRequest, RetrieveResponse
import asyncio
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from utils import get_prisma

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Initialize components
langsmith_client = Client()
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
prisma = get_prisma()

@router.post("/initialize", response_model=InitializeResponse)
async def initialize_vector_db():
    """Initialize the vector database with messages from the database."""
    try:
        prisma = get_prisma()
        
        # Delete existing index if it exists
        try:
            if "chatgenius-messages" in pc.list_indexes():
                pc.delete_index("chatgenius-messages")
                await asyncio.sleep(5)
        except Exception as e:
            print(f"Error deleting index: {str(e)}")
            
        # Create new index
        try:
            pc.create_index(
                name="chatgenius-messages",
                dimension=3072,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"
                )
            )
        except Exception as e:
            if "already exists" not in str(e).lower():
                raise e
            print("Index already exists, proceeding with initialization")
        
        # Initialize vector store
        vector_store = PineconeVectorStore(
            index_name="chatgenius-messages",
            embedding=embeddings,
            pinecone_api_key=os.getenv("PINECONE_API_KEY")
        )
        
        # Get all messages from the database
        messages = await prisma.message.find_many(
            include={
                "channel": True,
                "user": True
            }
        )
        
        # Convert messages to documents
        documents = []
        total_messages = len(messages)
        vectors_created = 0
        
        for msg in messages:
            if "@assistant" in msg.content:
                continue
                
            doc = Document(
                page_content=msg.content,
                metadata={
                    "message_id": str(msg.id),
                    "channel_id": str(msg.channelId),
                    "channel_name": msg.channel.name,
                    "channel_type": "private" if msg.channel.isPrivate else "public",
                    "sender_name": msg.user.username,
                    "thread_id": str(msg.threadId) if msg.threadId else "",
                }
            )
            documents.append(doc)
            vectors_created += 1
            
        # Add documents to vector store
        if documents:
            vector_store.add_documents(documents)
            
        return InitializeResponse(
            message="Vector database initialized successfully",
            total_messages=total_messages,
            vectors_created=vectors_created,
            index_name="chatgenius-messages"
        )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize vector database: {str(e)}")

async def get_user_accessible_channels(user_id: str) -> Dict[str, List[str]]:
    """Get all channels a user has access to, grouped by type."""
    try:
        prisma = get_prisma()
        
        # Get public channels
        public_channels = await prisma.channel.find_many(
            where={"isPrivate": False}
        )
        
        # Get private channels user is a member of
        user = await prisma.user.find_unique(
            where={"id": user_id},
            include={
                "channels": True
            }
        )
        
        private_channels = [channel for channel in user.channels if channel.isPrivate] if user else []
        
        channels = {
            "public": [str(c.id) for c in public_channels],
            "private": [str(c.id) for c in private_channels]
        }
        return channels
        
    except Exception as e:
        print(f"Error getting accessible channels: {str(e)}")
        return {
            "public": [],
            "private": []
        }

@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_similar_messages(request: RetrieveRequest):
    """Retrieve messages similar to the query."""
    try:
        with tracing_v2_enabled() as tracer:
            print(f"Retrieving similar messages for query: {request.query}")
            
            # Get user accessible channels
            accessible_channels = await get_user_accessible_channels(request.user_id)
            
            # Build filter based on channel type and user access
            filter_dict = {}
            if request.channel_type == "assistant":
                # When talking to assistant, search across all channels
                filter_dict = {
                    "$or": [
                        {"channel_type": "public"},
                        {"channel_type": "private"}
                    ]
                }
            elif request.channel_type == "private":
                filter_dict = {
                    "$or": [
                        {"channel_type": "public"},
                        {"channel_id": request.channel_id}
                    ]
                }
            else:
                filter_dict = {
                    "channel_type": "public"
                }
            
            # Initialize vector store for chat messages
            chat_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY")
            )
            
            # Initialize vector store for documents
            doc_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY"),
                namespace="documents"
            )
            
            # Perform similarity search on chat messages
            chat_docs_and_scores = chat_vector_store.similarity_search_with_score(
                request.query,
                k=request.top_k,
                filter=filter_dict
            )

            # Perform similarity search on documents with lower threshold
            doc_docs_and_scores = doc_vector_store.similarity_search_with_score(
                request.query,
                k=request.top_k,
                filter={"source_type": "document"}
            )
            
            # Combine and sort all results by score
            all_docs_and_scores = chat_docs_and_scores + doc_docs_and_scores
            all_docs_and_scores.sort(key=lambda x: x[1], reverse=True)
            
            # Format results
            messages = []
            for doc, score in all_docs_and_scores:
                # Use a lower threshold for all results to improve recall
                base_threshold = 0.1  # Lowered from 0.2 to match RetrieveRequest
                doc_threshold = base_threshold * 0.5 if doc.metadata.get("source_type") == "document" else base_threshold
                if score < doc_threshold:
                    continue
                
                # Get content from metadata fields, with fallback chain
                content = (
                    doc.metadata.get("content") or 
                    doc.metadata.get("text") or 
                    doc.metadata.get("page_content") or 
                    doc.page_content
                )
                
                # For document chunks, add rich context
                if doc.metadata.get("source_type") == "document":
                    file_name = doc.metadata.get("file_name", "Unknown document")
                    page = doc.metadata.get("page_number", "unknown")
                    chunk_index = doc.metadata.get("chunk_index", 0)
                    total_chunks = doc.metadata.get("total_chunks", 1)
                    content = f"[Source: {file_name} (Page {page}, Section {chunk_index + 1}/{total_chunks})]\n{content}"
                
                messages.append(Message(
                    message_id=doc.metadata.get("message_id") or doc.metadata.get("file_id", ""),
                    channel_name=doc.metadata.get("channel_name", "Document"),
                    sender_name=doc.metadata.get("sender_name", file_name) if doc.metadata.get("source_type") == "document" else doc.metadata.get("sender_name", "Unknown"),
                    content=content,
                    similarity=score
                ))
                
            return RetrieveResponse(
                query=request.query,
                messages=messages
            )
            
    except Exception as e:
        print(f"Error in retrieve_similar_messages: {str(e)}")
        return RetrieveResponse(query=request.query, messages=[])

@router.post("/update")
async def update_vector_db(message_id: str = Body(..., embed=True)):
    """Update the vector database with a new message."""
    print("\n=== VECTOR SERVICE UPDATE ENDPOINT CALLED ===")
    print(f"Received message_id: {message_id}")
    
    with tracing_v2_enabled() as tracer:
        try:
            # Initialize vector store
            vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY")
            )
            
            # Get message from database
            message = await prisma.message.find_unique(
                where={"id": message_id},
                include={"user": True, "channel": True}
            )
            
            if not message:
                raise HTTPException(status_code=404, detail="Message not found")
            
            # Skip messages containing @assistant
            if "@assistant" in message.content:
                print(f"Skipping message {message_id} - contains @assistant mention")
                return {"status": "skipped", "reason": "assistant mention"}
            
            # Create document
            print(f"\n=== Creating document for vector store ===")
            print(f"Message content: {message.content}")
            doc = Document(
                page_content=message.content,
                metadata={
                    "message_id": message.id,
                    "channel_id": message.channelId,
                    "channel_name": message.channel.name if message.channel else None,
                    "channel_type": "private" if message.channel and message.channel.isPrivate else "public",
                    "sender_name": message.user.username if message.user else None,
                }
            )
            print(f"Document created with metadata: {doc.metadata}")
            
            # Generate embedding
            print(f"\n=== Generating embedding ===")
            texts = [message.content]
            embeddings_list = await embeddings.aembed_documents(texts)
            print(f"Embedding generated with dimension: {len(embeddings_list[0])}")
            
            # Add to vector store
            print(f"\n=== Adding to vector store ===")
            await vector_store.aadd_documents([doc])
            print(f"Successfully added to vector store")
            
            return {"status": "success"}
            
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update vector database: {str(e)}"
            )

@router.post("/delete")
async def delete_from_vector_db(message_id: str = Body(..., embed=True)):
    """Delete a message from the vector database."""
    try:
        # Initialize vector store
        vector_store = PineconeVectorStore(
            index_name="chatgenius-messages",
            embedding=embeddings,
            pinecone_api_key=os.getenv("PINECONE_API_KEY")
        )
        
        # Delete by metadata filter
        vector_store.delete({"message_id": message_id})
        
        return {"message": "Vector deleted successfully"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete from vector database: {str(e)}")

@router.get("/stats")
async def get_index_stats():
    """Get statistics about the vector index."""
    try:
        # Get the index
        index = pc.Index("chatgenius-messages")
        
        # Get index stats
        stats = index.describe_index_stats()
        
        return {
            "status": "ok",
            "index_name": "chatgenius-messages",
            "total_vectors": stats.get("total_vector_count", 0),
            "dimension": stats.get("dimension", 1536)
        }
            
    except Exception as e:
        print(f"Error getting index stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 