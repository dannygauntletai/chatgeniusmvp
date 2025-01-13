from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from prisma import Prisma
import openai
from dotenv import load_dotenv
import os
from models import AssistantRequest, AssistantResponse
from vector_client import VectorServiceClient

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Assistant Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    """
    Get a context-aware response from the assistant.
    Context rules:
    - Public channel: Use all public message contexts
    - Private channel: Use all public message context + that private message context
    - DM channel: Use all public message context + that private dm channel context
    - Assistant channel: Use all messages both public and private context the user has access to
    """
    try:
        # Ensure database connection
        if not prisma.is_connected():
            print("Reconnecting to database...")
            await prisma.connect()

        # Get channel information
        try:
            print(f"Fetching channel {request.channel_id}...")
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
            print(f"Channel found: {channel is not None}")
            if channel:
                print(f"Channel type: {'private' if channel.isPrivate else 'public'}")
        except Exception as e:
            print(f"Error fetching channel: {str(e)}")
            channel = None
        
        # Get user information
        try:
            print(f"Fetching user {request.user_id}...")
            user = await prisma.user.find_unique(
                where={"id": request.user_id}
            )
            print(f"User found: {user is not None}")
        except Exception as e:
            print(f"Error fetching user: {str(e)}")
            user = None

        # Get relevant messages using vector search
        try:
            print("Retrieving similar messages...")
            similar_messages = await vector_client.retrieve_similar(
                query=request.message,
                user_id=request.user_id,
                channel_id=request.channel_id,
                channel_type=request.channel_type,
                top_k=10,
                threshold=0.3
            )
            print(f"Found {len(similar_messages)} similar messages")
        except Exception as e:
            print(f"Error retrieving similar messages: {str(e)}")
            similar_messages = []

        # Format context from similar messages
        context = []
        if similar_messages:
            context_str = "Relevant conversation history:\n"
            for msg in similar_messages:
                context_str += f"{msg.sender_name}: {msg.content}\n"
            context.append(context_str)

        # Add channel context
        if channel:
            channel_context = f"\nCurrent channel: {channel.name}"
            channel_context += f"\nChannel type: {'Private' if channel.isPrivate else 'Public'}"
            if channel.isPrivate:
                print("private")
                member_usernames = [member.username for member in channel.members]
                channel_context += f"\nThis is a private channel with members: {', '.join(member_usernames)}"
            if channel.owner:
                channel_context += f"\nChannel owner: {channel.owner.username}"
            context.append(channel_context)

        # Prepare the chat completion request
        messages = [
            {
                "role": "system", 
                "content": """You are ChatGenius, a helpful AI assistant integrated into a chat application. You have access to:
                1. The conversation history in the current channel
                2. Information about the current channel and its members
                3. The current user's query and context

                Guidelines:
                - Be concise and friendly in your responses
                - Use the conversation history to provide relevant and contextual responses
                - When appropriate, reference previous messages or users in your responses
                - Stay focused on the current channel's context and topic
                - If you're unsure about something, it's okay to ask for clarification
                """
            }
        ]
        
        if context:
            messages.append({"role": "system", "content": "\n".join(context)})
        
        if user:
            messages.append({
                "role": "system", 
                "content": f"The current user asking the question is {user.username}."
            })
            
        messages.append({"role": "user", "content": request.message})
        
        print(f"Request data: {request}")
        print(f"Channel found: {channel is not None}")
        print(f"User found: {user is not None}")
        print(f"Similar messages found: {len(similar_messages)}")
        print(f"Context built: {context}")
        
        # Get response from OpenAI
        try:
            response = client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                temperature=0.7,
                max_tokens=500
            )
            
            return AssistantResponse(
                response=response.choices[0].message.content,
                context_used=context,
                confidence=response.choices[0].finish_reason == "stop"
            )
        except Exception as e:
            print(f"Error getting OpenAI response: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get OpenAI response: {str(e)}"
            )
            
    except Exception as e:
        print(f"Unexpected error in assistant response: {str(e)}")
        if "connection" in str(e).lower():
            # Try to reconnect if it's a connection issue
            try:
                await prisma.disconnect()
                await prisma.connect()
            except Exception as reconnect_error:
                print(f"Failed to reconnect: {str(reconnect_error)}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error in assistant response: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002) 