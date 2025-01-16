import aiohttp
from typing import Dict, Optional, Tuple
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class PhoneServiceClient:
    """Client for interacting with the phone service."""
    
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv("PHONE_SERVICE_URL", "http://localhost:8000")
        self.session = None
        
    async def _ensure_session(self):
        if not self.session:
            self.session = aiohttp.ClientSession()
    
    async def close(self):
        """Close the client session."""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def extract_call_details(self, message: str, context: Optional[str] = None) -> Tuple[bool, Optional[Dict]]:
        """Extract call details from a message."""
        await self._ensure_session()
        
        print(f"Making request to {self.base_url}/phone/extract")  # Debug print
        print(f"Request data: {{'message': {message}, 'context': {context}}}")  # Debug print
        
        try:
            async with self.session.post(
                f"{self.base_url}/phone/extract",
                json={
                    "message": message,
                    "context": context
                }
            ) as response:
                print(f"Response status: {response.status}")  # Debug print
                response_text = await response.text()
                print(f"Response text: {response_text}")  # Debug print
                
                if response.status != 200:
                    raise Exception(f"Failed to extract call details: {response_text}")
                    
                result = await response.json()
                if not result["is_call_request"]:
                    return False, None
                    
                return True, {
                    "phone_number": result["phone_number"],
                    "message": result["message"]
                }
        except Exception as e:
            print(f"Error in extract_call_details: {str(e)}")  # Debug print
            raise
    
    async def make_call(self, to_number: str, message: str, from_number: Optional[str] = None, channel_id: str = None, user_id: str = None, thread_id: Optional[str] = None) -> Dict:
        """Make a phone call with a message."""
        await self._ensure_session()
        
        async with self.session.post(
            f"{self.base_url}/phone/call",
            json={
                "phone_number": to_number,
                "channel_id": channel_id,
                "user_id": user_id,
                "thread_id": thread_id,
                "message": message
            }
        ) as response:
            if response.status != 200:
                error_detail = await response.text()
                raise Exception(f"Failed to make call: {error_detail}")
            return await response.json()
    
    async def get_call_status(self, call_sid: str) -> Dict:
        """Get the status of a call."""
        await self._ensure_session()
        
        async with self.session.get(
            f"{self.base_url}/phone/call/{call_sid}"
        ) as response:
            if response.status != 200:
                error_detail = await response.text()
                raise Exception(f"Failed to get call status: {error_detail}")
            return await response.json() 