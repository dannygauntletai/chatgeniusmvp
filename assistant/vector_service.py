from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from prisma import Prisma
import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_core.documents import Document
from pinecone import Pinecone, ServerlessSpec
from models import Message, InitializeResponse, RetrieveRequest, RetrieveResponse
import asyncio
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled

# Load environment variables
load_dotenv()

# Initialize LangSmith
langsmith_client = Client()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Assistant Vector Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://chatgenius.fyi",
        os.getenv("FRONTEND_URL", ""),
        "https://chatgeniusmvp.onrender.com",
        "https://chatgeniusmvp-vector.onrender.com",
        "https://chatgeniusmvp-document.onrender.com",
        "https://chatgeniusmvp-phone.onrender.com",
        "https://chatgeniusmvp-backend.onrender.com",
        os.getenv("VECTOR_SERVICE_URL", ""),
        os.getenv("ASSISTANT_SERVICE_URL", ""),
        os.getenv("PHONE_SERVICE_URL", "")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Initialize LangChain components
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-large",
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# Initialize Prisma client with connection handling
prisma = Prisma(auto_register=True)

@app.post("/initialize", response_model=InitializeResponse)
async def initialize_vector_db():
    """Initialize the vector database with messages from the database."""
    try:
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
                dimension=3072,  # text-embedding-3-large dimension
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

@app.on_event("startup")
async def startup():
    await prisma.connect()

@app.on_event("shutdown")
async def shutdown():
    await prisma.disconnect()

async def create_embedding(text: str) -> List[float]:
    """Create an embedding for a given text using OpenAI's API."""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

async def get_user_accessible_channels(user_id: str) -> Dict[str, List[str]]:
    """Get all channels a user has access to, grouped by type."""
    try:
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
        print(f"Found accessible channels: {channels}")
        return channels
        
    except Exception as e:
        print(f"Error getting accessible channels: {str(e)}")
        # Return empty lists as fallback
        return {
            "public": [],
            "private": []
        }

@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_similar_messages(request: RetrieveRequest):
    """Retrieve messages similar to the query."""
    try:
        with tracing_v2_enabled() as tracer:
            print(f"Retrieving similar messages for query: {request.query}")
            
            # Get user accessible channels
            accessible_channels = await get_user_accessible_channels(request.user_id)
            
            # Build filter based on channel type and user access
            filter_dict = {}
            if request.channel_type == "private":
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
                filter={"source_type": "document"}  # Only get document chunks
            )

            print("Chat results:", chat_docs_and_scores)
            print("Document results:", doc_docs_and_scores)
            
            # Combine and sort all results by score
            all_docs_and_scores = chat_docs_and_scores + doc_docs_and_scores
            all_docs_and_scores.sort(key=lambda x: x[1], reverse=True)
            
            # Format results
            messages = []
            for doc, score in all_docs_and_scores:
                print(f"Processing doc with score {score}: {doc.metadata}")
                # Use a much lower threshold for document results
                doc_threshold = request.threshold * 0.5 if doc.metadata.get("source_type") == "document" else request.threshold
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
                    message_id=doc.metadata["message_id"],
                    channel_name=doc.metadata["channel_name"],
                    sender_name=doc.metadata["sender_name"],
                    content=content,
                    similarity=score
                ))
                
            print(f"Returning {len(messages)} messages with scores ranging from {messages[0].similarity if messages else 0} to {messages[-1].similarity if messages else 0}")
            return RetrieveResponse(
                query=request.query,
                messages=messages
            )
            
    except Exception as e:
        print(f"Error in retrieve_similar_messages: {str(e)}")
        return RetrieveResponse(query=request.query, messages=[])

@app.post("/update")
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
            doc = Document(
                page_content=message.content,
                metadata={
                    "message_id": message.id,
                    "channel_id": message.channelId,
                    "channel_name": message.channel.name if message.channel else None,
                    "sender_name": message.user.username if message.user else None,
                }
            )
            
            # Add to vector store
            await vector_store.aadd_documents([doc])
            
            return {"status": "success"}
            
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update vector database: {str(e)}"
            )

@app.post("/delete")
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

@app.get("/stats")
async def get_index_stats():
    """Get statistics about the vector index."""
    try:
        # Get the index
        index = pc.Index("chatgenius-messages")
        print("Connected to Pinecone index")
        
        # Get index stats
        stats = index.describe_index_stats()
        print(f"Index stats: {stats}")
        
        return {
            "status": "ok",
            "index_name": "chatgenius-messages",
            "total_vectors": stats.get("total_vector_count", 0),
            "dimension": stats.get("dimension", 1536)
        }
            
    except Exception as e:
        print(f"Error getting index stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port) 