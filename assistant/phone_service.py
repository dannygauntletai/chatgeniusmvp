from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse
from dotenv import load_dotenv
import os
from typing import Optional, Dict
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="ChatGenius Phone Service")

# Initialize chat model
chat = ChatOpenAI(
    model="gpt-4-turbo-preview",
    temperature=0.7,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://chatgenius.fyi",
        os.getenv("FRONTEND_URL", ""),
        os.getenv("VECTOR_SERVICE_URL", ""),
        os.getenv("ASSISTANT_SERVICE_URL", ""),
        os.getenv("DOCUMENT_SERVICE_URL", "")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Initialize Twilio client
twilio_client = Client(
    os.getenv("TWILIO_ACCOUNT_SID"),
    os.getenv("TWILIO_AUTH_TOKEN")
)

# Define request models
class CallRequest(BaseModel):
    to_number: str
    from_number: Optional[str] = None
    message: str

class ExtractCallRequest(BaseModel):
    message: str
    context: Optional[str] = None

# Define API endpoints
@app.post("/extract")
async def extract_call_info(request: ExtractCallRequest):
    """Extract call details from a natural language message."""
    try:
        details = await extract_call_details(request.message, request.context)
        print(details)
        if not details:
            return {"is_call_request": False}
            
        return {
            "is_call_request": True,
            "phone_number": details["phone_number"],
            "message": details["message"]
        }
        
    except Exception as e:
        print(e)
        print(f"Error in extract_call_info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract call details: {str(e)}"
        )

@app.post("/call")
async def make_call(request: CallRequest):
    """Make a phone call using Twilio."""
    try:
        # Create TwiML response
        response = VoiceResponse()
        response.say(request.message)
        
        # Make the call
        call = twilio_client.calls.create(
            to=request.to_number,
            from_=request.from_number or os.getenv("TWILIO_PHONE_NUMBER"),
            twiml=str(response)
        )
        
        return {
            "status": "success",
            "call_sid": call.sid,
            "to": request.to_number,
            "from": request.from_number or os.getenv("TWILIO_PHONE_NUMBER"),
            "status": call.status
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to make call: {str(e)}"
        )

@app.get("/call/{call_sid}")
async def get_call_status(call_sid: str):
    """Get the status of a call."""
    try:
        call = twilio_client.calls(call_sid).fetch()
        return {
            "call_sid": call.sid,
            "status": call.status,
            "duration": call.duration,
            "price": call.price
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get call status: {str(e)}"
        )

# Helper functions
async def extract_call_details(message: str, context: Optional[str] = None) -> Optional[Dict]:
    """Extract phone number and message from natural language request."""
    system_prompt = """You are a phone call assistant that MUST extract phone numbers and messages from requests.

    CRITICAL RULES:
    1. ANY message containing a phone number should be treated as a call request
    2. If you see a number that looks like a phone number, treat it as one
    3. The command can be in ANY format: "call", "@assistant call", "dial", "phone", etc.
    4. ALWAYS return a response if there's a number that could be a phone number

    For the phone number:
    - Remove any spaces, parentheses, or extra characters
    - Ensure it starts with + and country code
    - Convert formats like (862) 237-4016 to +18622374016

    Return JSON format:
    {
        "phone_number": "normalized number with +1 prefix",
        "message": "clear, concise message for the call"
    }

    Example inputs that MUST be detected:
    - @assistant call +18622374016 with my favorite pizza topping
    - call 862-237-4016 to order food
    - dial (862) 237 4016
    - +18622374016 tell them I'll be late
    - 8622374016 order pizza
    """
    
    # Clean up the input message
    message = message.strip()
    if message.startswith("@assistant"):
        message = message.replace("@assistant", "").strip()
    
    messages = [
        SystemMessage(content=system_prompt),
        SystemMessage(content=f"Previous context:\n{context}" if context else "No previous context available."),
        HumanMessage(content=message)
    ]
    
    try:
        response = await chat.ainvoke(messages)
        print(f"Input message: {message}")  # Debug print
        print(f"LLM Response: {response.content}")  # Debug print
        
        # Handle null responses
        if "null" in response.content.lower():
            return None
            
        # Parse the JSON response
        import json
        result = json.loads(response.content)
        
        # Normalize phone number
        if "phone_number" in result:
            # Remove any non-digit characters except +
            number = ''.join(c for c in result["phone_number"] if c.isdigit() or c == '+')
            
            # Add proper formatting
            if not number.startswith('+'):
                if number.startswith('1'):
                    number = '+' + number
                else:
                    number = '+1' + number
            
            result["phone_number"] = number
            
        print(f"Normalized result: {result}")  # Debug print
        return result
        
    except Exception as e:
        print(f"Error in extract_call_details: {str(e)}")  # Debug print
        return None

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port) 