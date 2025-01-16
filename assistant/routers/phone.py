from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Gather
from openai import AsyncOpenAI
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Pinecone as LangchainPinecone
import logging
from datetime import datetime
from models import CallResponse, TranscriptionResponse, RetrieveRequest
from routers.vector import retrieve_similar_messages, update_vector_db
import re
import json
import time
import asyncio
import httpx

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Initialize components
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
twilio_client = TwilioClient(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
embeddings = OpenAIEmbeddings()

async def check_call_status(call_sid: str, max_retries: int = 3) -> Optional[Dict[str, Any]]:
    """Check call status with retries."""
    for attempt in range(max_retries):
        try:
            await asyncio.sleep(0.5 * (attempt + 1))  # Exponential backoff
            call_status = twilio_client.calls(call_sid).fetch()
            return {
                "status": call_status.status,
                "direction": call_status.direction,
                "from": call_status.from_formatted,
                "to": call_status.to_formatted
            }
        except Exception as e:
            print(f"Attempt {attempt + 1} failed: {str(e)}")
            if attempt == max_retries - 1:
                return None
            continue

@router.post("/extract")
async def extract_call_details(
    message: str = Body(...),
    context: Optional[Dict[str, Any]] = Body(None)
):
    """Extract phone number and message from user input and enhance with RAG context."""
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
        
        # Extract context from the message
        # First, use GPT to understand what the call is about and what context we need
        context_prompt = f"""Analyze this message and extract:
1. What is this call about? (e.g., ordering food, making a reservation)
2. What specific context or preferences should we look for?
3. What would be a good search query to find relevant past messages?

Example response:
{{
    "topic": "ordering pizza",
    "context_needed": "pizza preferences, toppings, crust type, size, and any dietary restrictions",
    "search_query": "pizza preferences toppings order history"
}}

Message: {message_content}"""
        
        completion = await client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are helping to analyze a call request to determine what context to retrieve. Respond in JSON format with keys: topic, context_needed, search_query. Be specific and focused on what's needed for the call."},
                {"role": "user", "content": context_prompt}
            ],
            temperature=0.7,
            max_tokens=150,
            response_format={ "type": "json_object" }
        )
        
        analysis = json.loads(completion.choices[0].message.content)
        print(f"Call analysis: {analysis}")
        
        # Use the analysis to retrieve relevant context
        similar_messages = await retrieve_similar_messages(RetrieveRequest(
            query=analysis["search_query"],
            user_id=context.get('user_id', ''),
            channel_id=context.get('channel_id', ''),
            channel_type="assistant",
            top_k=10,
            threshold=0.5
        ))

        for msg in similar_messages.messages:
            print(f"Similar message: {msg.content}")
        
        if similar_messages.messages:
            # Use GPT to extract relevant information from similar messages
            context_extraction_prompt = f"""Based on these messages, what are the relevant details for a call about {analysis['topic']}? 
            Consider {analysis['context_needed']}.
            Be concise and natural, as this will be spoken in a phone call.
            Focus only on the most important details that are needed for this specific call.
            
            If you find specific preferences, include them clearly.
            If you don't find specific preferences, DO NOT mention that no preferences were found.
            Instead, use sensible defaults based on the type of order/request.
            
            For example:
            - For pizza: Assume a medium cheese pizza unless specific preferences are found
            - For restaurant reservations: Assume dinner time (7 PM) for 2 people unless specified
            - For appointments: Assume earliest available time unless specified
            
            Make the response sound natural and confident, as if you're a regular caller.

            Previous messages:
            {chr(10).join([f'- {msg.content}' for msg in similar_messages.messages])}"""
            
            completion = await client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are helping to make a phone call. Be natural and conversational. Never say 'no preferences found' or similar phrases. Instead, use sensible defaults when specific preferences aren't available. Keep the tone friendly and confident."},
                    {"role": "user", "content": context_extraction_prompt}
                ],
                temperature=0.7,
                max_tokens=150
            )
            
            context_details = completion.choices[0].message.content
            message_content = f"Hello! I'm calling to {analysis['topic']}. {context_details}"
        else:
            # Try a broader search if no specific preferences are found
            broader_query = f"preferences {analysis['topic']}"
            similar_messages = await retrieve_similar_messages(RetrieveRequest(
                query=broader_query,
                user_id=context.get('user_id', ''),
                channel_id=context.get('channel_id', ''),
                channel_type="assistant",
                top_k=10,
                threshold=0.5
            ))
            
            if similar_messages.messages:
                context_extraction_prompt = f"""Based on these messages, what are the relevant details or preferences about {analysis['topic']}? 
                Be concise and natural, as this will be spoken in a phone call.
                If you find specific preferences, include them.
                If you don't find specific preferences, use sensible defaults:
                - For food orders: Assume standard options (e.g., medium cheese pizza)
                - For reservations: Assume typical timing and party size
                - For appointments: Assume standard duration and earliest availability
                
                Make it sound natural and confident, like a regular phone call.

                Previous messages:
                {chr(10).join([f'- {msg.content}' for msg in similar_messages.messages])}"""
                
                completion = await client.chat.completions.create(
                    model="gpt-4-turbo-preview",
                    messages=[
                        {"role": "system", "content": "You are helping to make a phone call. Be natural and conversational. Never mention that preferences weren't found. Use sensible defaults when needed. Keep the tone friendly and confident."},
                        {"role": "user", "content": context_extraction_prompt}
                    ],
                    temperature=0.7,
                    max_tokens=150
                )
                
                context_details = completion.choices[0].message.content
                message_content = f"Hello! I'm calling to {analysis['topic']}. {context_details}"
            else:
                # Use defaults based on the topic
                if "pizza" in analysis['topic'].lower():
                    message_content = f"Hello! I'm calling to order a medium cheese pizza. Would you be able to help me with that?"
                elif "restaurant" in analysis['topic'].lower() or "reservation" in analysis['topic'].lower():
                    message_content = f"Hello! I'd like to make a dinner reservation for 2 people. What times do you have available this evening?"
                elif "appointment" in analysis['topic'].lower():
                    message_content = f"Hello! I'd like to schedule an appointment. What's your earliest available time?"
                else:
                    message_content = f"Hello! I'm calling about {analysis['topic']}. What options do you have available?"
            
        if not message_content:
            message_content = "Hello! This is ChatGenius calling. How can I help you today?"
            
        print(f"Final message content: {message_content}")
        return {
            "is_call_request": True,
            "phone_number": phone_number,
            "message": message_content
        }
        
    except Exception as e:
        print(f"Error extracting call details: {str(e)}")
        print(f"Error type: {type(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
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
        
        # Create TwiML for the call
        response = VoiceResponse()
        gather = Gather(
            input='speech',
            action=f"{os.getenv('ASSISTANT_SERVICE_URL', 'https://chatgenius.fyi')}/phone/transcribe?channel_id={channel_id}&user_id={user_id}&thread_id={thread_id}",
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
        
        # Poll for call completion and recording (max 5 minutes)
        max_attempts = 60  # 5 minutes with 5-second intervals
        for attempt in range(max_attempts):
            await asyncio.sleep(5)  # Wait 5 seconds between checks
            
            # Check call status
            call_status = twilio_client.calls(call.sid).fetch()
            print(f"Call status: {call_status.status}")
            
            if call_status.status in ['completed', 'failed', 'busy', 'no-answer', 'canceled']:
                # Call has ended, check for recording
                recordings = twilio_client.recordings.list(call_sid=call.sid)
                if recordings:
                    recording = recordings[0]
                    # Update the recording URL to include authentication
                    recording_url = f"https://{os.getenv('TWILIO_ACCOUNT_SID')}:{os.getenv('TWILIO_AUTH_TOKEN')}@api.twilio.com{recording.uri.replace('.json', '.mp3')}"
                    
                    # Send recording URL as message
                    try:
                        backend_url = os.getenv('BACKEND_URL', 'http://localhost:5000')
                        if not backend_url.startswith(('http://', 'https://')):
                            backend_url = f"http://{backend_url}"
                            
                        print(f"Sending recording URL to backend: {backend_url}")
                        async with httpx.AsyncClient() as client:
                            message_response = await client.post(
                                f"{backend_url}/api/messages/assistant",
                                json={
                                    "content": recording_url,
                                    "channelId": channel_id,
                                    "userId": os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot")
                                }
                            )
                            print(f"Message response status: {message_response.status_code}")
                            print(f"Message response: {message_response.text}")
                    except Exception as e:
                        print(f"Error sending recording URL: {str(e)}")
                        print(f"Error type: {type(e)}")
                break
            
            if attempt == max_attempts - 1:
                print("Warning: Reached maximum polling time without call completion")
        
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
            channel_type="assistant",
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

@router.get("/recording/{call_sid}")
async def get_call_recording(call_sid: str):
    """Get the recording URL for a specific call."""
    try:
        print(f"\n=== GETTING RECORDING FOR CALL {call_sid} ===")
        # Get recordings for the call
        recordings = twilio_client.recordings.list(call_sid=call_sid)
        print(f"Found {len(recordings)} recordings")
        
        if not recordings:
            print("No recordings found")
            raise HTTPException(status_code=404, detail="No recording found for this call")
            
        # Get the most recent recording
        recording = recordings[0]
        print(f"Recording SID: {recording.sid}")
        print(f"Recording Status: {recording.status}")
        print(f"Recording Duration: {recording.duration}")
        print(f"Recording URI: {recording.uri}")
        
        # Update the recording URL to include authentication
        recording_url = f"https://{os.getenv('TWILIO_ACCOUNT_SID')}:{os.getenv('TWILIO_AUTH_TOKEN')}@api.twilio.com{recording.uri.replace('.json', '.mp3')}"
        print(f"Final Recording URL: {recording_url}")
        
        response_data = {
            "recording_url": recording_url,
            "duration": recording.duration,
            "status": recording.status,
            "recording_sid": recording.sid
        }
        print(f"Returning response: {response_data}")
        return response_data
        
    except Exception as e:
        print(f"Error getting call recording: {str(e)}")
        print(f"Error type: {type(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise HTTPException(status_code=500, detail=str(e)) 