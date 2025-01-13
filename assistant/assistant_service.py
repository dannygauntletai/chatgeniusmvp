from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from prisma import Prisma
import openai
from dotenv import load_dotenv
import os
from models import AssistantRequest, AssistantResponse
from vector_client import VectorServiceClient
from langsmith import Client
from langchain_core.tracers.context import tracing_v2_enabled
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_openai import ChatOpenAI

# Load environment variables
load_dotenv()

# Initialize LangSmith
langsmith_client = Client()

# Initialize chat model
chat = ChatOpenAI(
    model="gpt-4-turbo-preview",
    temperature=0.7,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Assistant Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Initialize OpenAI client
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Prisma client with connection handling
prisma = Prisma(auto_register=True)

# Initialize Vector Service client
vector_client = VectorServiceClient()

@app.on_event("startup")
async def startup():
    try:
        print("Connecting to database...")
        await prisma.connect()
        print("Database connection established")
    except Exception as e:
        print(f"Failed to connect to database: {str(e)}")
        raise e

@app.on_event("shutdown")
async def shutdown():
    try:
        print("Disconnecting from database...")
        await prisma.disconnect()
        await vector_client.close()
        print("Cleanup completed")
    except Exception as e:
        print(f"Error during shutdown: {str(e)}")

async def get_channel_context(channel_id: str, limit: int = 50) -> List[Dict]:
    """Get recent messages from a specific channel."""
    messages = await prisma.message.find_many(
        where={
            "channelId": channel_id,
        },
        include={
            "user": True,
            "thread": True,
            "replies": {
                "include": {
                    "user": True
                }
            }
        },
        order={
            "createdAt": "desc"
        },
        take=limit
    )
    return messages

async def get_dm_context(user_id: str, other_user_id: str, limit: int = 50) -> List[Dict]:
    """Get recent direct messages between two users."""
    channel = await prisma.channel.find_first(
        where={
            "type": "DM",
            "OR": [
                {
                    "AND": [
                        {"creatorId": user_id},
                        {"recipientId": other_user_id}
                    ]
                },
                {
                    "AND": [
                        {"creatorId": other_user_id},
                        {"recipientId": user_id}
                    ]
                }
            ]
        }
    )
    
    if not channel:
        return []
        
    messages = await prisma.message.find_many(
        where={
            "channelId": channel.id
        },
        include={
            "user": True,
            "thread": True,
            "replies": {
                "include": {
                    "user": True
                }
            }
        },
        order={
            "createdAt": "desc"
        },
        take=limit
    )
    return messages

async def format_messages_for_context(messages: List[Dict]) -> str:
    """Format messages into a string context."""
    context = []
    for msg in messages:
        thread_context = ""
        if msg.thread:
            thread_context = f"\nIn reply to: {msg.thread.content}"
        elif msg.replies:
            replies = [f"- {reply.user.username}: {reply.content}" for reply in msg.replies[:3]]
            thread_context = f"\nReplies:\n" + "\n".join(replies)
            
        context.append(
            f"{msg.user.username}: {msg.content}{thread_context}"
        )
    return "\n".join(context)

async def format_vector_messages_for_context(messages: List[Dict]) -> str:
    """Format vector search results into a string context."""
    context = []
    for msg in messages:
        context.append(
            f"{msg.sender_name} (similarity: {msg.similarity:.2f}): {msg.content}"
        )
    return "\n".join(context)

@app.post("/assist", response_model=AssistantResponse)
async def get_assistant_response(request: AssistantRequest):
    """Get a response from the assistant with context."""
    
    with tracing_v2_enabled() as tracer:
        try:
            # Get channel and user context
            channel = await prisma.channel.find_unique(
                where={"id": request.channel_id},
                include={
                    "members": True,
                    "owner": True,
                    "messages": {
                        "include": {
                            "user": True
                        }
                    }
                }
            )
            
            user = await prisma.user.find_unique(
                where={"id": request.user_id}
            )
            
            if not channel or not user:
                raise HTTPException(status_code=404, detail="Channel or user not found")
            
            # Build context string
            context = ""
            
            # Add channel context
            if channel:
                context += f"\nChannel: {channel.name}"
                context += f"\nType: {'Private' if channel.isPrivate else 'Public'}"
                if channel.isPrivate and channel.members:
                    members = [member.username for member in channel.members]
                    context += f"\nMembers: {', '.join(members)}"
                if channel.owner:
                    context += f"\nOwner: {channel.owner.username}"
                
            # Add user context
            if user:
                context += f"\nCurrent user: {user.username}"
            
            # Get recent channel messages for context
            recent_messages = await prisma.message.find_many(
                where={
                    "channelId": channel.id,
                    "NOT": {
                        "content": {
                            "contains": "@assistant"
                        }
                    }
                },
                include={
                    "user": True,
                    "thread": True
                },
                order={
                    "createdAt": "desc"
                },
                take=5
            )
            
            if recent_messages:
                context += "\n\nRecent conversation:"
                for msg in reversed(recent_messages):
                    thread_info = ""
                    if msg.thread:
                        thread_info = f" (replying to thread)"
                    if msg.user:
                        context += f"\n{msg.user.username}: {msg.content}{thread_info}"
            
            # Get similar messages
            similar = await vector_client.retrieve_similar(
                query=request.message,
                user_id=request.user_id,
                channel_id=request.channel_id,
                channel_type="private" if channel.isPrivate else "public",
                top_k=5,
                threshold=0.3
            )
            
            if similar:
                context += "\n\nRelevant message history:\n"
                for msg in similar:
                    context += f"{msg.sender_name}: {msg.content}\n"
                
            # Prepare messages for chat completion
            messages = [
                SystemMessage(content=f"""You are a helpful assistant in a chat application.
                    Current context:
                    {context}
                    
                    Respond naturally and conversationally while using the context to inform your responses.
                    Keep responses concise but informative."""),
                HumanMessage(content=request.message)
            ]
            
            # Get chat completion
            chat = ChatOpenAI(temperature=0.7)
            response = await chat.ainvoke(messages)
            
            return {
                "response": response.content,
                "context_used": similar,
                "confidence": 1.0
            }
            
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get assistant response: {str(e)}"
            )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002) 