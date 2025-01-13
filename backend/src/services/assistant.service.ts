import { Channel, Message } from '@prisma/client';

export class AssistantService {
  private assistantUrl = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8002';

  private getChannelType(channel: Channel): string {
    if (channel.isPrivate) return 'private';
    return 'public';
  }

  async getAssistantResponse(message: Message, channel: Channel, userId: string): Promise<string> {
    try {
      const response = await fetch(`${this.assistantUrl}/assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.content.replace(/@assistant/gi, '').trim(), // Remove @assistant mention
          channel_id: channel.id,
          user_id: userId,
          channel_type: this.getChannelType(channel),
          thread_id: message.threadId
        })
      });

      if (!response.ok) {
        throw new Error(`Assistant service error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Assistant service error:', error);
      throw new Error('Failed to get assistant response');
    }
  }
} 