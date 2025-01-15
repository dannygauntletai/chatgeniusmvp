from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Gather
from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
import logging
from datetime import datetime
from models import CallResponse, TranscriptionResponse
from routers.vector import retrieve_similar_messages, update_vector_db

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Initialize components
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
twilio_client = TwilioClient(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings()

@router.post("/call", response_model=CallResponse)
async def initiate_call(
    phone_number: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    thread_id: Optional[str] = Body(None)
):
    """Initiate a phone call using Twilio."""
    try:
        print(f"\n=== PHONE SERVICE CALL ENDPOINT CALLED ===")
        print(f"Phone: {phone_number}")
        print(f"Channel: {channel_id}")
        print(f"User: {user_id}")
        print(f"Thread: {thread_id}")
        
        # Create TwiML for the call
        response = VoiceResponse()
        gather = Gather(
            input='speech',
            action=f'/transcribe?channel_id={channel_id}&user_id={user_id}&thread_id={thread_id}',
            method='POST',
            language='en-US',
            speechTimeout='auto'
        )
        gather.say("Hello! I'm ChatGenius. How can I help you today?")
        response.append(gather)
        
        # Make the call
        call = twilio_client.calls.create(
            to=phone_number,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            twiml=str(response),
            record=True
        )
        
        return CallResponse(
            message="Call initiated successfully",
            call_sid=call.sid
        )
        
    except Exception as e:
        print(f"Error initiating call: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/transcribe", response_model=TranscriptionResponse)
async def handle_transcription(
    channel_id: str = Body(...),
    user_id: str = Body(...),
    thread_id: Optional[str] = Body(None),
    speech_result: str = Body(...)
):
    """Handle speech transcription and generate AI response."""
    try:
        print(f"\n=== PHONE SERVICE TRANSCRIBE ENDPOINT CALLED ===")
        print(f"Speech: {speech_result}")
        print(f"Channel: {channel_id}")
        print(f"User: {user_id}")
        print(f"Thread: {thread_id}")
        
        # Get similar messages from vector store using direct function call
        retrieve_response = await retrieve_similar_messages(RetrieveRequest(
            query=speech_result,
            channel_id=channel_id,
            user_id=user_id,
            channel_type="private",
            top_k=5,
            threshold=0.7
        ))
        similar_messages = retrieve_response.messages
        
        # Build conversation context
        context = "You are ChatGenius, a helpful AI assistant on a phone call. "
        context += "You help users by providing accurate and relevant information based on the conversation history. "
        context += "Keep your responses concise and clear, as they will be spoken to the user. "
        context += "Use natural, conversational language suitable for phone calls.\n\n"
        
        if similar_messages:
            context += "Here are some relevant previous messages that might help with context:\n"
            for msg in similar_messages:
                context += f"{msg.sender_name}: {msg.content}\n"
            context += "\n"
        
        # Generate AI response
        completion = await client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": context},
                {"role": "user", "content": speech_result}
            ],
            temperature=0.7,
            max_tokens=200  # Keep responses shorter for voice
        )
        
        response = completion.choices[0].message.content
        
        # Create TwiML response
        twiml = VoiceResponse()
        gather = Gather(
            input='speech',
            action=f'/transcribe?channel_id={channel_id}&user_id={user_id}&thread_id={thread_id}',
            method='POST',
            language='en-US',
            speechTimeout='auto'
        )
        gather.say(response)
        twiml.append(gather)
        
        # Store transcription and response in vector store using direct function call
        await update_vector_db(f"phone-{channel_id}-{thread_id if thread_id else 'main'}")
        
        return TranscriptionResponse(
            message="Transcription processed successfully",
            response=response
        )
        
    except Exception as e:
        print(f"Error handling transcription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 