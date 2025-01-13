from fastapi import FastAPI, HTTPException
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

# Initialize OpenAI client
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Prisma client
prisma = Prisma()

# Initialize Vector Service client
vector_client = VectorServiceClient()

@app.on_event("startup")
async def startup():
    await prisma.connect()

@app.on_event("shutdown")
async def shutdown():
    await prisma.disconnect()
    await vector_client.close()

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
        # Get relevant messages using vector search
        similar_messages = await vector_client.retrieve_similar(
            query=request.message,
            user_id=request.user_id,
            channel_id=request.channel_id,
            channel_type=request.channel_type,
            top_k=5,
            threshold=0.5  # Lower threshold for more context
        )

        # Format context from similar messages
        context = []
        if similar_messages:
            context_str = "Relevant conversation history:\n"
            for msg in similar_messages:
                context_str += f"{msg.sender_name} in {msg.channel_name} (relevance: {msg.similarity:.2f}): {msg.content}\n"
            context.append(context_str)

        # Prepare the chat completion request
        messages = [
            {
                "role": "system", 
                "content": """You are ChatGenius, a helpful AI assistant. You have access to the conversation context 
                and should use it to provide relevant and contextual responses. Keep your responses concise and friendly.
                When referencing context, don't mention similarity scores or technical details."""
            }
        ]
        
        if context:
            messages.append({"role": "system", "content": "\n".join(context)})
            
        messages.append({"role": "user", "content": request.message})
        
        # Get response from OpenAI
        response = await client.chat.completions.create(
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
        raise HTTPException(status_code=500, detail=f"Failed to get assistant response: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002) 