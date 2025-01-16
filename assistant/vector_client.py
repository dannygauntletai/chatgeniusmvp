from typing import List
import httpx
from models import Message, InitializeResponse, RetrieveResponse
import asyncio
from httpx import TimeoutException, ConnectError
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class VectorServiceClient:
    def __init__(self, base_url: str = None):
        # Use the assistant service URL since vector endpoints are in the same service
        self.base_url = base_url or os.getenv("ASSISTANT_SERVICE_URL", "http://localhost:8000")
        self.client = httpx.AsyncClient(timeout=10.0)  # Shorter timeout
        self.max_retries = 3
    
    async def close(self):
        await self.client.aclose()
    
    async def _make_request_with_retry(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Make a request with retry logic."""
        last_error = None
        for attempt in range(self.max_retries):
            try:
                response = await self.client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except (TimeoutException, ConnectError) as e:
                print(f"Attempt {attempt + 1} failed: {str(e)}")
                last_error = e
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(1 * (attempt + 1))  # Exponential backoff
                continue
            except Exception as e:
                print(f"Unexpected error in vector client: {str(e)}")
                raise e
        raise last_error
    
    async def retrieve_similar(
        self,
        query: str,
        user_id: str,
        channel_id: str,
        channel_type: str,
        top_k: int = 5,
        threshold: float = 0.3  # Lower default threshold
    ) -> List[Message]:
        """
        Retrieve messages similar to the query.
        Context rules:
        - Public channel: Use all public message contexts
        - Private channel: Use all public message context + that private message context
        - DM channel: Use all public message context + that private dm channel context
        - Assistant channel: Use all messages both public and private context the user has access to
        """
        try:
            response = await self._make_request_with_retry(
                "POST",
                f"{self.base_url}/vector/retrieve",
                json={
                    "query": query,
                    "user_id": user_id,
                    "channel_id": channel_id,
                    "channel_type": channel_type,
                    "top_k": top_k,
                    "threshold": threshold
                }
            )
            result = RetrieveResponse(**response.json())
            return result.messages
        except Exception as e:
            print(f"Failed to retrieve similar messages: {str(e)}")
            return []  # Return empty list on error 