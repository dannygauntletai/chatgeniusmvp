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
from openai import AsyncOpenAI
from pydantic import BaseModel, validator

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Initialize components
langsmith_client = Client()
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
prisma = get_prisma()
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class RetrieveRequest(BaseModel):
    query: str
    user_id: str
    channel_id: Optional[str] = None
    channel_type: str = "public"
    top_k: int = 5
    threshold: float = 0.4  # Lowered from 0.7 to 0.4 for better semantic matching
    
    @validator("threshold")
    def validate_threshold(cls, v):
        if v < 0 or v > 1:
            raise ValueError("Threshold must be between 0 and 1")
        return v

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
    """Retrieve messages and documents similar to the query, with user-specific context when relevant."""
    try:
        with tracing_v2_enabled() as tracer:
            print(f"Retrieving similar messages and documents for query: {request.query}")
            
            # Get user accessible channels
            accessible_channels = await get_user_accessible_channels(request.user_id)
            
            # Check if this is a user-specific request
            is_user_specific = False
            target_username = None
            
            # Get the requesting user's username
            user = await prisma.user.find_unique(
                where={"id": request.user_id}
            )
            requesting_username = user.username if user else None
            
            # Use LLM to analyze if the query is requesting user-specific information
            analysis_prompt = f"""Analyze this query to determine:
            1. Is this a request that would benefit from user preferences or past history?
            2. What type of preferences or history would be relevant?
            3. Should we look for specific user information?

            For example:
            - "ordering pizza" -> Yes, should check for pizza preferences, dietary restrictions, past orders
            - "call someone" -> Yes, should check for contact preferences, past call history
            - "what's the weather" -> No, general query without user context

            Query: {request.query}
            Current user: {requesting_username}

            Respond in JSON format:
            {{
                "needs_preferences": boolean,
                "preference_types": list[string],
                "is_user_specific": boolean,
                "target_user": string or null,
                "search_queries": list[string]
            }}
            """
            
            completion = await client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You analyze queries to determine what user preferences or history would be relevant. Be thorough in identifying opportunities to personalize responses."},
                    {"role": "user", "content": analysis_prompt}
                ],
                temperature=0,
                response_format={ "type": "json_object" }
            )
            
            analysis = json.loads(completion.choices[0].message.content)
            print(f"Query analysis: {analysis}")
            
            is_user_specific = analysis["is_user_specific"]
            target_username = analysis["target_user"]
            
            if is_user_specific and not target_username and requesting_username:
                target_username = requesting_username
            
            # Build filter based on channel type and user access
            filter_dict = {}
            if request.channel_type == "assistant":
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
            
            # Add user-specific filter if needed
            if is_user_specific and target_username:
                print(f"Filtering results for user: {target_username}")
                if "$or" in filter_dict:
                    # Add sender_name condition to each existing filter
                    for condition in filter_dict["$or"]:
                        condition["sender_name"] = target_username
                else:
                    filter_dict["sender_name"] = target_username
            
            # Initialize vector stores
            chat_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY")
            )
            
            summary_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY"),
                namespace="document_summaries"
            )
            
            doc_vector_store = PineconeVectorStore(
                index_name="chatgenius-messages",
                embedding=embeddings,
                pinecone_api_key=os.getenv("PINECONE_API_KEY"),
                namespace="documents"
            )
            
            # Search chat messages
            print(f"\nSearching chat messages for: {request.query}")
            chat_results = chat_vector_store.similarity_search_with_score(
                request.query,
                k=request.top_k,
                filter=filter_dict
            )
            
            # Search document summaries
            print(f"\nSearching document summaries for: {request.query}")
            summary_results = summary_vector_store.similarity_search_with_score(
                request.query,
                k=5  # Start with top 5 most relevant summaries
            )
            
            # Process summary results and fetch associated documents
            doc_results = []
            for summary_doc, summary_score in summary_results:
                print(f"\nFound summary with score {summary_score}:")
                print(f"Content: {summary_doc.page_content}")
                print(f"Full metadata: {json.dumps(summary_doc.metadata, indent=2)}")
                
                # Lower threshold for document summaries since they're pre-filtered for relevance
                summary_threshold = 0.3
                if summary_score < summary_threshold:
                    print(f"Score {summary_score} below threshold {summary_threshold}, skipping")
                    continue
                
                # Get the associated document chunks
                if "file_id" in summary_doc.metadata:
                    print(f"\nFetching chunks for file_id: {summary_doc.metadata['file_id']}")
                    file_docs = doc_vector_store.similarity_search_with_score(
                        "",  # Empty query since we're using filter
                        k=50,  # Get more chunks to ensure we have full context
                        filter={
                            "file_id": summary_doc.metadata["file_id"],
                            "source_type": "document"
                        }
                    )
                    print(f"Found {len(file_docs)} chunks")
                    
                    # Add all chunks with the summary's score
                    for doc, _ in file_docs:
                        doc_results.append((doc, summary_score))
                else:
                    print(f"\nWARNING: Summary document missing file_id in metadata")
            
            # Format all results
            messages = []
            
            # Format chat results
            for doc, score in chat_results:
                if score < request.threshold:
                    continue
                try:
                    messages.append(Message(
                        message_id=doc.metadata.get("message_id", "unknown"),
                        channel_name=doc.metadata.get("channel_name", "Unknown"),
                        sender_name=doc.metadata.get("sender_name", "Unknown"),
                        content=doc.page_content,
                        similarity=score
                    ))
                except Exception as e:
                    print(f"Error formatting chat result: {str(e)}")
                    continue
                        
            # Format document results
            for doc, score in doc_results:
                try:
                    content = doc.page_content
                    if not content:
                        continue
                        
                    # Add source context
                    file_name = doc.metadata.get("file_name", "Unknown document")
                    page = doc.metadata.get("page_number", "unknown")
                    chunk_index = doc.metadata.get("chunk_index", 0)
                    total_chunks = doc.metadata.get("total_chunks", 1)
                    
                    formatted_content = f"[Source: {file_name} (Page {page}, Part {chunk_index + 1}/{total_chunks})]\n{content}"
                    
                    messages.append(Message(
                        message_id=doc.metadata.get("file_id", "unknown"),
                        channel_name="Document",
                        sender_name=file_name,
                        content=formatted_content,
                        similarity=score
                    ))
                except Exception as e:
                    print(f"Error formatting document result: {str(e)}")
                    continue
            
            # Sort all messages by similarity score
            messages.sort(key=lambda x: x.similarity, reverse=True)
            
            return RetrieveResponse(
                query=request.query,
                messages=messages
            )
                
    except Exception as e:
        print(f"Error retrieving similar messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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