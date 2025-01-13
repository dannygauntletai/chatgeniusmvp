const ASSISTANT_API_URL = import.meta.env.VITE_ASSISTANT_API_URL || 'http://localhost:8002';

interface AssistantResponse {
  response: string;
  context_used: string[];
  confidence: number;
}

export class AssistantService {
  static async getResponse(message: string, channelId: string, userId: string, channelType: 'public' | 'private' | 'DM', threadId?: string | null): Promise<AssistantResponse> {
    const response = await fetch(`${ASSISTANT_API_URL}/assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        channel_id: channelId,
        user_id: userId,
        channel_type: channelType,
        thread_id: threadId ?? undefined
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get assistant response');
    }

    return response.json();
  }
} 