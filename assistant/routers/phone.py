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
import re

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Initialize components
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
twilio_client = TwilioClient(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings()

@router.post("/extract")
async def extract_call_details(
    message: str = Body(...),
    context: Optional[str] = Body(None)
):
    """Extract phone number and message from user input."""
    try:
        print(f"\n=== PHONE SERVICE EXTRACT ENDPOINT CALLED ===")
        print(f"Message: {message}")
        print(f"Context: {context}")
        
        # Simple regex to extract phone numbers
        phone_pattern = r'\+?1?\d{10,}'
        phone_match = re.search(phone_pattern, message)
        
        if not phone_match:
            return {
                "is_call_request": False,
                "phone_number": None,
                "message": None
            }
            
        phone_number = phone_match.group()
        # Ensure phone number is in E.164 format
        if not phone_number.startswith('+'):
            if phone_number.startswith('1'):
                phone_number = '+' + phone_number
            else:
                phone_number = '+1' + phone_number
                
        # Remove the phone number from the message to get the actual message
        message_content = message.replace(phone_number, '').strip()
        if not message_content:
            message_content = "Hello! This is ChatGenius calling. How can I help you today?"
            
        return {
            "is_call_request": True,
            "phone_number": phone_number,
            "message": message_content
        }
        
    except Exception as e:
        print(f"Error extracting call details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/call", response_model=CallResponse)
async def initiate_call(
    phone_number: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    thread_id: Optional[str] = Body(None),
    message: Optional[str] = Body(None)
):
    """Initiate a phone call using Twilio."""
    try:
        print(f"\n=== PHONE SERVICE CALL ENDPOINT CALLED ===")
        print(f"Phone: {phone_number}")
        print(f"Channel: {channel_id}")
        print(f"User: {user_id}")
        print(f"Thread: {thread_id}")
        print(f"Message: {message}")
        print(f"TWILIO_ACCOUNT_SID: {os.getenv('TWILIO_ACCOUNT_SID')}")
        print(f"TWILIO_PHONE_NUMBER: {os.getenv('TWILIO_PHONE_NUMBER')}")
        print(f"Auth token length: {len(os.getenv('TWILIO_AUTH_TOKEN', ''))}")
        
        # Create TwiML for the call
        response = VoiceResponse()
        gather = Gather(
            input='speech',
            action=f'/phone/transcribe?channel_id={channel_id}&user_id={user_id}&thread_id={thread_id}',
            method='POST',
            language='en-US',
            speechTimeout='auto'
        )
        
        # Use provided message or default greeting
        initial_message = message if message else "Hello! I'm ChatGenius. How can I help you today?"
        gather.say(initial_message)
        response.append(gather)
        
        print(f"TwiML response: {str(response)}")
        
        # Make the call
        print("Attempting to create Twilio call...")
        call = twilio_client.calls.create(
            to=phone_number,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            twiml=str(response),
            record=True
        )
        print(f"Call created successfully with SID: {call.sid}")
        
        # Check call status
        call_status = twilio_client.calls(call.sid).fetch()
        print(f"Call status: {call_status.status}")
        print(f"Call direction: {call_status.direction}")
        print(f"Call from: {call_status.from_formatted}")
        print(f"Call to: {call_status.to_formatted}")
        if hasattr(call_status, 'error_code'):
            print(f"Error code: {call_status.error_code}")
        if hasattr(call_status, 'error_message'):
            print(f"Error message: {call_status.error_message}")
        
        return CallResponse(
            message="Call initiated successfully",
            call_sid=call.sid
        )
        
    except Exception as e:
        print(f"Error initiating call: {str(e)}")
        print(f"Error type: {type(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
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