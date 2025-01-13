from fastapi import FastAPI
from typing import List, Dict
from pinecone import Pinecone, ServerlessSpec
from prisma import Prisma
import os
from dotenv import load_dotenv
import openai
from models import Message, InitializeResponse, RetrieveRequest, RetrieveResponse

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Assistant Vector Service")

# Initialize OpenAI client
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Initialize Prisma client
prisma = Prisma()

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
    # Get public channels
    public_channels = await prisma.channel.find_many(
        where={"type": "PUBLIC"},
        select={"id": True}
    )
    
    # Get private channels user is a member of
    private_channels = await prisma.channel.find_many(
        where={
            "type": "PRIVATE",
            "members": {
                "some": {
                    "userId": user_id
                }
            }
        },
        select={"id": True}
    )
    
    # Get DM channels user is part of
    dm_channels = await prisma.channel.find_many(
        where={
            "type": "DM",
            "OR": [
                {"creatorId": user_id},
                {"recipientId": user_id}
            ]
        },
        select={"id": True}
    )
    
    return {
        "public": [str(c.id) for c in public_channels],
        "private": [str(c.id) for c in private_channels],
        "dm": [str(c.id) for c in dm_channels]
    }

@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_similar_messages(request: RetrieveRequest):
    """
    Retrieve messages similar to the query using vector similarity search.
    Context rules:
    - Public channel: Use all public messages
    - Private channel: Use all public messages + that private channel's messages
    - DM channel: Use all public messages + that DM channel's messages
    - Assistant channel: Use all messages the user has access to
    """
    try:
        # Create embedding for the query
        query_embedding = await create_embedding(request.query)
        
        # Get the index
        index = pc.Index("chatgenius-messages")
        
        # Build filter based on channel type and user access
        accessible_channels = await get_user_accessible_channels(request.user_id)
        
        filter_condition = {}
        if request.channel_type == "public":
            # Only public messages
            filter_condition = {
                "channel_type": "PUBLIC"
            }
        elif request.channel_type == "private":
            # Public messages + specific private channel
            filter_condition = {
                "or": [
                    {"channel_type": "PUBLIC"},
                    {"channel_id": request.channel_id}
                ]
            }
        elif request.channel_type == "dm":
            # Public messages + specific DM channel
            filter_condition = {
                "or": [
                    {"channel_type": "PUBLIC"},
                    {"channel_id": request.channel_id}
                ]
            }
        elif request.channel_type == "assistant":
            # All messages user has access to
            filter_condition = {
                "or": [
                    {"channel_type": "PUBLIC"},
                    {"channel_id": {"in": accessible_channels["private"]}},
                    {"channel_id": {"in": accessible_channels["dm"]}}
                ]
            }
        
        # Perform similarity search
        results = index.query(
            vector=query_embedding,
            top_k=request.top_k,
            include_metadata=True,
            filter=filter_condition
        )
        
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
                created_at=match.metadata["created_at"],
                similarity=match.score
            ))
        
        return RetrieveResponse(
            query=request.query,
            messages=messages
        )
            
    except Exception as e:
        return RetrieveResponse(query=request.query, messages=[])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 