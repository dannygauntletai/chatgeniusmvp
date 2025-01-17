from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_pinecone import PineconeVectorStore
from models import Message, InitializeResponse, RetrieveRequest, RetrieveResponse
import asyncio
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from utils import get_prisma
from openai import AsyncOpenAI
from pydantic import BaseModel, validator
import json
import logging

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Initialize components
langsmith_client = Client()
pc = Pinecone(
    api_key=os.getenv("PINECONE_API_KEY"),
    environment=os.getenv("PINECONE_ENVIRONMENT", "gcp-starter")
)
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Constants
CHAT_INDEX_NAME = "chatgenius-messages"
SUMMARY_NAMESPACE = "document_summaries"
DOCUMENT_NAMESPACE = "documents"
SUMMARY_THRESHOLD = 0.3
DEFAULT_TOP_K = 5

class VectorStoreManager:
    def __init__(self):
        self.chat_store = self._create_store()
        self.summary_store = self._create_store(namespace=SUMMARY_NAMESPACE)
        self.doc_store = self._create_store(namespace=DOCUMENT_NAMESPACE)

    def _create_store(self, namespace: str = None) -> PineconeVectorStore:
        """Create a vector store with optional namespace."""
        config = {
            "index_name": CHAT_INDEX_NAME,
            "embedding": embeddings,
            "pinecone_api_key": os.getenv("PINECONE_API_KEY")
        }
        if namespace:
            config["namespace"] = namespace
        return PineconeVectorStore(**config)

    async def search_chat_messages(self, query: str, top_k: int, filter_dict: Dict) -> List[tuple]:
        """Search for similar chat messages."""
        return self.chat_store.similarity_search_with_score(
            query,
            k=top_k,
            filter=filter_dict
        )

    async def search_document_summaries(self, query: str) -> List[tuple]:
        """Search for relevant document summaries."""
        return self.summary_store.similarity_search_with_score(
            query,
            k=DEFAULT_TOP_K
        )

    async def search_document_chunks(self, file_id: str) -> List[tuple]:
        """Search for document chunks by file ID."""
        return self.doc_store.similarity_search_with_score(
            "",  # Empty query since we're using filter
            k=50,  # Get more chunks to ensure we have full context
            filter={
                "file_id": file_id,
                "source_type": "document"
            }
        )

class QueryAnalyzer:
    def __init__(self, client: AsyncOpenAI):
        self.client = client

    async def analyze_query(self, query: str, requesting_username: str) -> Dict:
        """Analyze query for user-specific context and preferences."""
        analysis_prompt = f"""Analyze this query to determine:
        1. Is this a request that would benefit from user preferences or past history?
        2. What type of preferences or history would be relevant?
        3. Should we look for specific user information?

        Query: {query}
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

        completion = await self.client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You analyze queries to determine what user preferences or history would be relevant. Be thorough in identifying opportunities to personalize responses."},
                {"role": "user", "content": analysis_prompt}
            ],
            temperature=0,
            response_format={ "type": "json_object" }
        )
        
        return json.loads(completion.choices[0].message.content)

class FilterBuilder:
    @staticmethod
    def build_filter(channel_type: str, channel_id: str = None, target_username: str = None) -> Dict:
        """Build filter dictionary based on channel type and user access."""
        filter_dict = {}
        
        if channel_type == "assistant":
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

        if target_username:
            if "$or" in filter_dict:
                for condition in filter_dict["$or"]:
                    condition["sender_name"] = target_username
            else:
                filter_dict["sender_name"] = target_username

        return filter_dict

class ResultFormatter:
    @staticmethod
    def format_chat_result(doc: Document, score: float) -> Optional[Message]:
        """Format a chat message result."""
        try:
            return Message(
                message_id=doc.metadata.get("message_id", "unknown"),
                channel_name=doc.metadata.get("channel_name", "Unknown"),
                sender_name=doc.metadata.get("sender_name", "Unknown"),
                content=doc.page_content,
                similarity=score
            )
        except Exception as e:
            logging.error(f"Error formatting chat result: {str(e)}")
            return None

    @staticmethod
    def format_document_result(doc: Document, score: float) -> Optional[Message]:
        """Format a document result."""
        try:
            content = doc.page_content
            if not content:
                return None

            file_name = doc.metadata.get("file_name", "Unknown document")
            page = doc.metadata.get("page_number", "unknown")
            chunk_index = doc.metadata.get("chunk_index", 0)
            total_chunks = doc.metadata.get("total_chunks", 1)
            
            formatted_content = f"[Source: {file_name} (Page {page}, Part {chunk_index + 1}/{total_chunks})]\n{content}"
            
            return Message(
                message_id=doc.metadata.get("file_id", "unknown"),
                channel_name="Document",
                sender_name=file_name,
                content=formatted_content,
                similarity=score
            )
        except Exception as e:
            logging.error(f"Error formatting document result: {str(e)}")
            return None

class VectorUpdateRequest(BaseModel):
    channel_id: str
    channel_type: str
    user_id: str
    content: str
    sender_name: str

    @validator('channel_type')
    def validate_channel_type(cls, v):
        valid_types = ['dm', 'public', 'private', 'assistant']
        if v not in valid_types:
            raise ValueError(f'channel_type must be one of: {valid_types}')
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

# Initialize managers and services
vector_store_manager = VectorStoreManager()
query_analyzer = QueryAnalyzer(openai_client)

@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_similar_messages(request: RetrieveRequest):
    """Retrieve messages and documents similar to the query, with user-specific context when relevant."""
    try:
        with tracing_v2_enabled():
            logging.info(f"Retrieving similar messages and documents for query: {request.query}")
            
            # Get user information
            prisma = get_prisma()
            user = await prisma.user.find_unique(
                where={"id": request.user_id}
            )
            requesting_username = user.username if user else None
            
            # Analyze query for user context
            analysis = await query_analyzer.analyze_query(request.query, requesting_username)
            is_user_specific = analysis["is_user_specific"]
            target_username = analysis["target_user"]
            
            if is_user_specific and not target_username and requesting_username:
                target_username = requesting_username
            
            # Build filter and search for results
            filter_dict = FilterBuilder.build_filter(
                request.channel_type,
                request.channel_id,
                target_username if is_user_specific else None
            )
            
            # Search for relevant content
            chat_results = await vector_store_manager.search_chat_messages(
                request.query,
                request.top_k,
                filter_dict
            )
            
            summary_results = await vector_store_manager.search_document_summaries(request.query)
            
            # Process results
            messages = []
            
            # Process chat results
            for doc, score in chat_results:
                if score < request.threshold:
                    continue
                if msg := ResultFormatter.format_chat_result(doc, score):
                    messages.append(msg)
            
            # Process document results
            for summary_doc, summary_score in summary_results:
                if summary_score < SUMMARY_THRESHOLD:
                    continue
                
                if "file_id" in summary_doc.metadata:
                    file_docs = await vector_store_manager.search_document_chunks(
                        summary_doc.metadata["file_id"]
                    )
                    
                    for doc, _ in file_docs:
                        if msg := ResultFormatter.format_document_result(doc, summary_score):
                            messages.append(msg)
            
            # Sort results by similarity
            messages.sort(key=lambda x: x.similarity, reverse=True)
            
            return RetrieveResponse(
                query=request.query,
                messages=messages
            )
                
    except Exception as e:
        logging.error(f"Error retrieving similar messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/initialize", response_model=InitializeResponse)
async def initialize_vector_db():
    """Initialize the vector database with messages from the database."""
    try:
        prisma = get_prisma()
        
        # Delete existing index if it exists
        try:
            if CHAT_INDEX_NAME in pc.list_indexes():
                pc.delete_index(CHAT_INDEX_NAME)
                await asyncio.sleep(5)
        except Exception as e:
            logging.error(f"Error deleting index: {str(e)}")
            
        # Create new index
        try:
            pc.create_index(
                name=CHAT_INDEX_NAME,
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
            logging.info("Index already exists, proceeding with initialization")
        
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
                    "user_id": str(msg.userId)
                }
            )
            documents.append(doc)
            vectors_created += 1
            
        # Add documents to vector store
        if documents:
            vector_store_manager.chat_store.add_documents(documents)
            
        return InitializeResponse(
            message="Vector database initialized successfully",
            total_messages=total_messages,
            vectors_created=vectors_created,
            index_name=CHAT_INDEX_NAME
        )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize vector database: {str(e)}")

@router.post("/update")
async def update_vector_db(request: VectorUpdateRequest):
    """Update vector database with new message."""
    try:
        # Skip vector updates only for assistant messages
        if request.user_id == os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot"):
            return {"status": "skipped", "reason": "assistant message"}
            
        # Create document for vector store
        doc = Document(
            page_content=request.content,
            metadata={
                "channel_id": request.channel_id,
                "channel_type": request.channel_type,
                "user_id": request.user_id,
                "sender_name": request.sender_name
            }
        )
        
        await vector_store_manager.chat_store.aadd_documents([doc])
        return {"status": "success"}
            
    except ValueError as e:
        logging.error(f"Validation error in update_vector_db: {str(e)}")
        # Return a more user-friendly response instead of error
        return {
            "status": "skipped",
            "reason": f"validation error: {str(e)}",
            "received_data": {
                "channel_type": getattr(request, 'channel_type', None),
                "user_id": getattr(request, 'user_id', None),
                "content_length": len(getattr(request, 'content', '')) if hasattr(request, 'content') else None
            }
        }
    except Exception as e:
        logging.error(f"Error in update_vector_db: {str(e)}")
        # Return a graceful failure instead of error
        return {
            "status": "failed",
            "reason": "internal error, message will be retried",
            "error": str(e)
        }

@router.post("/delete")
async def delete_from_vector_db(message_id: str = Body(..., embed=True)):
    """Delete a message from the vector database."""
    try:
        vector_store_manager.chat_store.delete({"message_id": message_id})
        return {"message": "Vector deleted successfully"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete from vector database: {str(e)}")

@router.get("/stats")
async def get_index_stats():
    """Get statistics about the vector index."""
    try:
        index = pc.Index(CHAT_INDEX_NAME)
        stats = index.describe_index_stats()
        
        return {
            "status": "ok",
            "index_name": CHAT_INDEX_NAME,
            "total_vectors": stats.get("total_vector_count", 0),
            "dimension": stats.get("dimension", 1536)
        }
            
    except Exception as e:
        logging.error(f"Error getting index stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/retrieve/channel", response_model=RetrieveResponse)
async def retrieve_similar_channel_messages(request: ChannelMessagesRequest):
    """Retrieve messages from a specific channel."""
    try:
        with tracing_v2_enabled():
            logging.info(f"Retrieving messages for channel: {request.channel_id}")
            
            # Build filter for channel-specific search
            filter_dict = {
                "channel_id": request.channel_id
            }
            
            # Search for content
            chat_results = await vector_store_manager.search_chat_messages(
                request.query,
                request.top_k,
                filter_dict
            )
            
            # Process results
            messages = []
            for doc, score in chat_results:
                if msg := ResultFormatter.format_chat_result(doc, score):
                    messages.append(msg)
            
            return RetrieveResponse(
                query=request.query,
                messages=messages
            )
                
    except Exception as e:
        logging.error(f"Error retrieving channel messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/retrieve/user", response_model=RetrieveResponse)
async def retrieve_similar_user_messages(request: UserMessagesRequest):
    """Retrieve messages from a specific user."""
    try:
        with tracing_v2_enabled():
            logging.info(f"Retrieving messages for user: {request.user_id}")
            
            # Build filter for user-specific search
            filter_dict = {
                "user_id": request.user_id
            }
            
            # Add sender name filter if provided
            if request.sender_name:
                filter_dict["sender_name"] = request.sender_name
            
            # Search for content - use empty query if none provided
            chat_results = await vector_store_manager.search_chat_messages(
                request.query,  # Use provided query or empty string
                request.top_k,
                filter_dict
            )
            
            # Process results - don't filter by threshold since we want all messages
            messages = []
            for doc, score in chat_results:
                if msg := ResultFormatter.format_chat_result(doc, score):
                    messages.append(msg)
            
            return RetrieveResponse(
                query=request.query,
                messages=messages
            )
                
    except Exception as e:
        logging.error(f"Error retrieving user messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 