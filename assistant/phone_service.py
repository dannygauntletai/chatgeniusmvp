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
    allow_origins=["http://localhost:3000"],
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
        if not details:
            return {"is_call_request": False}
            
        return {
            "is_call_request": True,
            "phone_number": details["phone_number"],
            "message": details["message"]
        }
        
    except Exception as e:
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
    system_prompt = """You are a helpful assistant that extracts phone call details from natural language requests.
    If the message contains a request to make a phone call, return a JSON with:
    - phone_number: the phone number to call
    - message: what should be said in the call, incorporating any relevant context about user preferences or history
    If it's not a call request, return null.
    
    When generating the message:
    - Include relevant preferences or context from previous messages
    - Keep the message natural and conversational
    - Be specific about any preferences mentioned
    - Keep it concise but complete
    
    Examples:
    Input: "call 123-456-7890 and tell them hello"
    Context: None
    Output: {"phone_number": "123-456-7890", "message": "hello"}
    
    Input: "can you call +1-555-0123 to order a pizza with my preferences"
    Context: "User mentioned: I like pepperoni and extra cheese. No mushrooms please."
    Output: {"phone_number": "+1-555-0123", "message": "I would like to order a pizza with pepperoni and extra cheese, but no mushrooms please."}
    """
    
    messages = [
        SystemMessage(content=system_prompt),
        SystemMessage(content=f"Previous context:\n{context}" if context else "No previous context available."),
        HumanMessage(content=message)
    ]
    
    try:
        response = await chat.ainvoke(messages)
        print(f"LLM Response: {response.content}")  # Debug print
        
        if "null" in response.content.lower():
            return None
            
        import json
        return json.loads(response.content)
    except Exception as e:
        print(f"Error in extract_call_details: {str(e)}")  # Debug print
        return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003) 