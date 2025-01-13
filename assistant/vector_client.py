from typing import List
import httpx
from models import Message, InitializeResponse, RetrieveResponse

class VectorServiceClient:
    def __init__(self, base_url: str = "http://localhost:8001"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        await self.client.aclose()
    
    async def retrieve_similar(
        self,
        query: str,
        user_id: str,
        channel_id: str,
        channel_type: str,
        top_k: int = 5,
        threshold: float = 0.7
    ) -> List[Message]:
        """
        Retrieve messages similar to the query.
        Context rules:
        - Public channel: Use all public message contexts
        - Private channel: Use all public message context + that private message context
        - DM channel: Use all public message context + that private dm channel context
        - Assistant channel: Use all messages both public and private context the user has access to
        """
        response = await self.client.post(
            f"{self.base_url}/retrieve",
            json={
                "query": query,
                "user_id": user_id,
                "channel_id": channel_id,
                "channel_type": channel_type,
                "top_k": top_k,
                "threshold": threshold
            }
        )
        response.raise_for_status()
        result = RetrieveResponse(**response.json())
        return result.messages 