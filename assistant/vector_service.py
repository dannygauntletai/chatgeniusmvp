from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from pinecone import Pinecone, ServerlessSpec
from prisma import Prisma
import os
from dotenv import load_dotenv
import openai
from models import Message, InitializeResponse, RetrieveRequest, RetrieveResponse
import asyncio

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Assistant Vector Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Initialize Prisma client
prisma = Prisma()

@app.post("/initialize", response_model=InitializeResponse)
async def initialize_vector_db():
    """Initialize the vector database with messages from the database."""
    try:
        # Delete existing index if it exists
        try:
            if "chatgenius-messages" in pc.list_indexes():
                pc.delete_index("chatgenius-messages")
                # Wait for deletion to complete
                await asyncio.sleep(5)
        except Exception as e:
            print(f"Error deleting index: {str(e)}")
            
        # Create new index
        try:
            pc.create_index(
                name="chatgenius-messages",
                dimension=1536,  # text-embedding-3-small dimension
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"
                )
            )
        except Exception as e:
            if "already exists" not in str(e).lower():
                raise e
            print("Index already exists, proceeding with initialization")
        
        index = pc.Index("chatgenius-messages")
        
        # Get all messages from the database
        messages = await prisma.message.find_many(
            include={
                "channel": True,
                "user": True
            }
        )
        
        # Create embeddings and upsert to Pinecone
        vectors = []
        total_messages = len(messages)
        vectors_created = 0
        
        for msg in messages:
            embedding = await create_embedding(msg.content)
            vectors.append({
                "id": str(msg.id),
                "values": embedding,
                "metadata": {
                    "message_id": str(msg.id),
                    "channel_id": str(msg.channelId),
                    "channel_name": msg.channel.name,
                    "channel_type": "private" if msg.channel.isPrivate else "public",
                    "sender_name": msg.user.username,
                    "content": msg.content,
                    "thread_id": str(msg.threadId) if msg.threadId else "",
                }
            })
            vectors_created += 1
            
            # Batch upsert every 100 vectors
            if len(vectors) >= 100:
                index.upsert(vectors=vectors)
                vectors = []
        
        # Upsert any remaining vectors
        if vectors:
            index.upsert(vectors=vectors)
            
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
        private_channels = await prisma.channel.find_many(
            where={
                "isPrivate": True,
                "members": {
                    "some": {
                        "userId": user_id
                    }
                }
            }
        )
        
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
    """
    Retrieve messages similar to the query using vector similarity search.
    Context rules:
    - Public channel: Use all public messages
    - Private channel: Use all public messages + that private channel's messages
    """
    try:
        print(f"Retrieving similar messages for query: {request.query}")
        # Create embedding for the query
        query_embedding = await create_embedding(request.query)
        
        # Get the index
        index = pc.Index("chatgenius-messages")
        
        # Build filter based on channel type and user access
        accessible_channels = await get_user_accessible_channels(request.user_id)
        print(f"User accessible channels: {accessible_channels}")
        
        filter_condition = {}
        if request.channel_type == "private":
            # For private channels, only include messages from this channel and public channels
            filter_condition = {
                "$or": [
                    {"channel_type": "public"},
                    {"channel_id": request.channel_id}
                ]
            }
        else:
            # For public channels, include all public messages
            filter_condition = {
                "channel_type": "public"
            }
            
        print(f"Using filter condition: {filter_condition}")
        
        # Perform similarity search with lower threshold
        results = index.query(
            vector=query_embedding,
            top_k=request.top_k,
            include_metadata=True,
            filter=filter_condition
        )
        print(f"Raw results: {results}")
        
        # Format results
        messages = []
        for match in results.matches:
            if match.score < request.threshold:
                continue
                
            messages.append(Message(
                message_id=match.metadata["message_id"],
                channel_name=match.metadata["channel_name"],
                sender_name=match.metadata["sender_name"],
                content=match.metadata["content"],
                similarity=match.score
            ))
        
        print(f"Returning {len(messages)} messages")
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
    
    try:
        print(f"[UPDATE] Received request to update vector for message: {message_id}")
        
        # Get the message from the database
        print("[UPDATE] Fetching message from database...")
        message = await prisma.message.find_unique(
            where={"id": message_id},
            include={
                "channel": True,
                "user": True
            }
        )
        
        if not message:
            print(f"[UPDATE] Message not found: {message_id}")
            raise HTTPException(status_code=404, detail="Message not found")
            
        # Create embedding for the message
        print("[UPDATE] Creating embedding...")
        embedding = await create_embedding(message.content)
        print("[UPDATE] Embedding created")
        
        # Get the index
        print("[UPDATE] Connecting to Pinecone index...")
        index = pc.Index("chatgenius-messages")
        print("[UPDATE] Connected to Pinecone index")
        
        # Prepare vector data
        vector_data = {
            "id": str(message.id),
            "values": embedding,
            "metadata": {
                "message_id": str(message.id),
                "channel_id": str(message.channelId),
                "channel_name": message.channel.name,
                "channel_type": "private" if message.channel.isPrivate else "public",
                "sender_name": message.user.username,
                "content": message.content,
                "thread_id": str(message.threadId) if message.threadId else "",
                "created_at": message.createdAt.isoformat()
            }
        }
        print("[UPDATE] Vector data prepared:", vector_data["metadata"])
        
        # Upsert the vector
        print("[UPDATE] Upserting vector...")
        index.upsert(vectors=[vector_data])
        print("[UPDATE] Vector upserted successfully")
        
        return {"message": "Vector database updated successfully"}
            
    except Exception as e:
        print(f"[UPDATE] Error updating vector: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/delete")
async def delete_from_vector_db(message_id: str = Body(..., embed=True)):
    """Delete a message from the vector database."""
    try:
        # Get the index
        index = pc.Index("chatgenius-messages")
        
        # Delete the vector
        index.delete(ids=[message_id])
        
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
    uvicorn.run(app, host="0.0.0.0", port=8001) 