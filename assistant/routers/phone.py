from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Gather
from openai import AsyncOpenAI
import logging
from models import CallResponse, TranscriptionResponse, RetrieveRequest, Message
from routers.vector import retrieve_similar_messages
import json
import asyncio
import httpx
import re

# Load environment variables
load_dotenv()

# Initialize router
router = APIRouter()

# Constants
PHONE_NUMBER_PATTERN = r'\+?1?\d{10,}'
MAX_POLLING_ATTEMPTS = 60  # 5 minutes with 5-second intervals
POLLING_INTERVAL = 5  # seconds
MAX_TOKENS_VOICE = 150  # Reduced for voice responses
MAX_CONTEXT_TOKENS = 1000  # Limited context for voice
MODEL_NAME = "gpt-4-turbo-preview"
TEMPERATURE = 0.7
SIMILARITY_THRESHOLD = 0.7
TOP_K = 3  # Reduced for voice context

class TwilioManager:
    def __init__(self):
        self.client = TwilioClient(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN")
        )
        self.phone_number = os.getenv("TWILIO_PHONE_NUMBER")

    def create_twiml_response(self, message: str, channel_id: str, user_id: str, thread_id: Optional[str] = None) -> VoiceResponse:
        """Create a TwiML response for the call."""
        response = VoiceResponse()
        gather = Gather(
            input='speech',
            action=f"{os.getenv('ASSISTANT_SERVICE_URL', 'https://chatgenius.fyi')}/phone/transcribe?channel_id={channel_id}&user_id={user_id}&thread_id={thread_id}",
            method='POST',
            language='en-US',
            speechTimeout='auto'
        )
        gather.say(message)
        response.append(gather)
        return response

    async def make_call(self, phone_number: str, twiml: str) -> str:
        """Initiate a call using Twilio."""
        try:
            call = self.client.calls.create(
                to=phone_number,
                from_=self.phone_number,
                twiml=str(twiml),
                record=True
            )
            return call.sid
        except Exception as e:
            logging.error(f"Error making Twilio call: {str(e)}")
            raise

    async def get_call_status(self, call_sid: str) -> Dict[str, Any]:
        """Get the current status of a call."""
        try:
            call = self.client.calls(call_sid).fetch()
            return {
                "status": call.status,
                "direction": call.direction,
                "from": call.from_formatted,
                "to": call.to_formatted
            }
        except Exception as e:
            logging.error(f"Error getting call status: {str(e)}")
            raise

    async def get_recording_url(self, call_sid: str) -> Optional[Dict[str, Any]]:
        """Get the recording URL for a call."""
        try:
            recordings = self.client.recordings.list(call_sid=call_sid)
            if not recordings:
                return None

            recording = recordings[0]
            recording_url = f"https://{os.getenv('TWILIO_ACCOUNT_SID')}:{os.getenv('TWILIO_AUTH_TOKEN')}@api.twilio.com{recording.uri.replace('.json', '.mp3')}"
            
            return {
                "recording_url": recording_url,
                "duration": recording.duration,
                "status": recording.status,
                "recording_sid": recording.sid
            }
        except Exception as e:
            logging.error(f"Error getting recording URL: {str(e)}")
            return None

class MessageManager:
    def __init__(self, client: AsyncOpenAI):
        self.client = client
        self.backend_url = os.getenv('BACKEND_URL', 'http://localhost:5000')
        if not self.backend_url.startswith(('http://', 'https://')):
            self.backend_url = f"http://{self.backend_url}"

    async def analyze_call_request(self, message: str) -> Dict[str, Any]:
        """Analyze a call request to determine context and preferences."""
        context_prompt = """Analyze this message and extract:
        1. What is this call about? (e.g., ordering food, making a reservation)
        2. What specific context or preferences should we look for?
        3. What would be a good search query to find relevant past messages?

        Message: {message}"""

        completion = await self.client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "You are helping to analyze a call request to determine what context to retrieve. Respond in JSON format with keys: topic, context_needed, search_query. Be specific and focused on what's needed for the call."},
                {"role": "user", "content": context_prompt.format(message=message)}
            ],
            temperature=TEMPERATURE,
            max_tokens=150,
            response_format={"type": "json_object"}
        )
        
        return json.loads(completion.choices[0].message.content)

    async def generate_call_script(self, topic: str, context_needed: str, similar_messages: List[Message]) -> str:
        """Generate a natural call script based on context and preferences."""
        if not similar_messages:
            return self._get_default_script(topic)

        # Limit the number of messages used for context
        similar_messages = similar_messages[:TOP_K]
        
        context_prompt = f"""Based on these messages, what are the relevant details for a call about {topic}? 
        Consider {context_needed}.
        Be concise and natural, as this will be spoken in a phone call.
        Focus only on the most important details that are needed for this specific call.
        
        Previous messages:
        {chr(10).join([f'- {msg.content}' for msg in similar_messages])}"""

        # Truncate context if it's too long
        if len(context_prompt) > MAX_CONTEXT_TOKENS * 4:
            context_prompt = context_prompt[:MAX_CONTEXT_TOKENS * 4] + "...\n[Context truncated for length]"

        completion = await self.client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "You are helping to make a phone call. Be natural and conversational. Never say 'no preferences found' or similar phrases. Instead, use sensible defaults when specific preferences aren't available. Keep the tone friendly and confident."},
                {"role": "user", "content": context_prompt}
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS_VOICE
        )
        
        return f"Hello! I'm calling to {topic}. {completion.choices[0].message.content}"

    def _get_default_script(self, topic: str) -> str:
        """Get a default script based on the topic."""
        if "pizza" in topic.lower():
            return "Hello! I'm calling to order a medium cheese pizza. Would you be able to help me with that?"
        elif "restaurant" in topic.lower() or "reservation" in topic.lower():
            return "Hello! I'd like to make a dinner reservation for 2 people. What times do you have available this evening?"
        elif "appointment" in topic.lower():
            return "Hello! I'd like to schedule an appointment. What's your earliest available time?"
        else:
            return f"Hello! I'm calling about {topic}. What options do you have available?"

    async def send_recording_message(self, recording_url: str, channel_id: str) -> bool:
        """Send a message with the recording URL to the backend."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.backend_url}/api/messages/assistant",
                    json={
                        "content": recording_url,
                        "channelId": channel_id,
                        "userId": os.getenv("ASSISTANT_BOT_USER_ID", "assistant-bot")
                    }
                )
                return response.status_code == 200
        except Exception as e:
            logging.error(f"Error sending recording message: {str(e)}")
            return False

class CallManager:
    def __init__(self, twilio_manager: TwilioManager, message_manager: MessageManager):
        self.twilio = twilio_manager
        self.message_manager = message_manager

    async def wait_for_recording(self, call_sid: str, channel_id: str, max_attempts: int = MAX_POLLING_ATTEMPTS) -> Optional[str]:
        """Wait for call completion and recording, then send to frontend."""
        for attempt in range(max_attempts):
            await asyncio.sleep(POLLING_INTERVAL)
            
            try:
                call_status = await self.twilio.get_call_status(call_sid)
                if call_status["status"] == "failed":
                    return "Call failed to connect"
                    
                if call_status["status"] in ["completed", "failed", "busy", "no-answer", "canceled"]:
                    recording_data = await self.twilio.get_recording_url(call_sid)
                    if recording_data:
                        # Send recording URL to frontend
                        success = await self.message_manager.send_recording_message(
                            recording_data["recording_url"],
                            channel_id
                        )
                        if success:
                            return recording_data["recording_url"]
                        else:
                            return "Failed to send recording to frontend"
                    break
            except Exception as e:
                logging.error(f"Error checking call status: {str(e)}")
                continue
            
        return "No recording available"

# Initialize managers
twilio_manager = TwilioManager()
message_manager = MessageManager(AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY")))
call_manager = CallManager(twilio_manager, message_manager)

@router.post("/call", response_model=CallResponse)
async def initiate_call(
    phone_number: str = Body(...),
    channel_id: str = Body(...),
    user_id: str = Body(...),
    thread_id: Optional[str] = Body(None),
    message: Optional[str] = Body(None)
):
    """Initiate a phone call and handle recording."""
    try:
        # Create TwiML response
        initial_message = message if message else "Hello! I'm ChatGenius. How can I help you today?"
        twiml = twilio_manager.create_twiml_response(initial_message, channel_id, user_id, thread_id)
        
        # Make the call
        call_sid = await twilio_manager.make_call(phone_number, str(twiml))
        
        # Start background task to wait for recording
        asyncio.create_task(call_manager.wait_for_recording(call_sid, channel_id))
        
        return CallResponse(
            message="Call initiated successfully",
            call_sid=call_sid
        )
        
    except Exception as e:
        logging.error(f"Error initiating call: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract")
async def extract_call_details(
    message: str = Body(...),
    context: Optional[Dict[str, Any]] = Body(None)
):
    """Extract phone number and message from user input and enhance with RAG context."""
    try:
        # Extract phone number
        phone_match = re.search(PHONE_NUMBER_PATTERN, message)
        if not phone_match:
            return {
                "is_call_request": False,
                "phone_number": None,
                "message": None
            }
            
        phone_number = phone_match.group()
        if not phone_number.startswith('+'):
            phone_number = '+1' + phone_number.lstrip('1')
                
        # Remove phone number from message
        message_content = message.replace(phone_number, '').strip()
        
        # Analyze call request
        analysis = await message_manager.analyze_call_request(message_content)
        
        # Get relevant context
        similar_messages = await retrieve_similar_messages(RetrieveRequest(
            query=analysis["search_query"],
            user_id=context.get('user_id', ''),
            channel_id=context.get('channel_id', ''),
            channel_type="assistant",
            top_k=TOP_K,
            threshold=SIMILARITY_THRESHOLD
        ))
        
        # Generate call script
        message_content = await message_manager.generate_call_script(
            analysis["topic"],
            analysis["context_needed"],
            similar_messages.messages
        )
            
        return {
            "is_call_request": True,
            "phone_number": phone_number,
            "message": message_content
        }
        
    except Exception as e:
        logging.error(f"Error extracting call details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recording/{call_sid}")
async def get_call_recording(call_sid: str):
    """Get the recording URL for a specific call."""
    try:
        recording_data = await twilio_manager.get_recording_url(call_sid)
        if not recording_data:
            raise HTTPException(status_code=404, detail="No recording found for this call")
        return recording_data
            
    except Exception as e:
        logging.error(f"Error getting call recording: {str(e)}")
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
        # Get similar messages for context
        retrieve_response = await retrieve_similar_messages(RetrieveRequest(
            query=speech_result,
            channel_id=channel_id,
            user_id=user_id,
            channel_type="assistant",
            top_k=TOP_K,
            threshold=SIMILARITY_THRESHOLD
        ))
        
        # Build context
        context = "You are ChatGenius, a helpful AI assistant on a phone call. "
        context += "You help users by providing accurate and relevant information based on the conversation history. "
        context += "Keep your responses concise and clear, as they will be spoken to the user. "
        context += "Use natural, conversational language suitable for phone calls.\n\n"
        
        if retrieve_response.messages:
            context += "Here are some relevant previous messages that might help with context:\n"
            # Limit the number of messages used for context
            for msg in retrieve_response.messages[:TOP_K]:
                context += f"{msg.sender_name}: {msg.content}\n"
            context += "\n"
        
        # Truncate context if it's too long
        if len(context) > MAX_CONTEXT_TOKENS * 4:
            context = context[:MAX_CONTEXT_TOKENS * 4] + "...\n[Context truncated for length]"
        
        # Generate response
        completion = await message_manager.client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": context},
                {"role": "user", "content": speech_result}
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS_VOICE
        )
        
        response = completion.choices[0].message.content
        
        return TranscriptionResponse(
            message="Transcription processed successfully",
            response=response
        )
        
    except Exception as e:
        logging.error(f"Error handling transcription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 