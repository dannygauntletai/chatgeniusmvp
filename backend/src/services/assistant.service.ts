import { Channel, Message } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class AssistantService {
  private assistantUrl = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';

  private getChannelType(channel: Channel): string {
    if (channel.isPrivate) return 'private';
    return 'public';
  }

  async getAssistantResponse(message: Message, channel: Channel, userId: string): Promise<string> {
    console.log('\n=== ASSISTANT SERVICE - getAssistantResponse ===');
    console.log('Message:', {
      id: message.id,
      content: message.content,
      channelId: message.channelId
    });
    console.log('Channel:', {
      id: channel.id,
      name: channel.name,
      type: channel.isPrivate ? 'private' : 'public'
    });
    console.log('UserId:', userId);

    try {
      // If this is a channel query (summarize, etc.)
      const isChannelQuery = message.content.toLowerCase().includes('summarize') || 
        message.content.toLowerCase().includes('summary') ||
        message.content.toLowerCase().includes('what') ||
        message.content.toLowerCase().includes('who') ||
        message.content.toLowerCase().includes('when') ||
        message.content.toLowerCase().includes('where') ||
        message.content.toLowerCase().includes('why') ||
        message.content.toLowerCase().includes('how');

      console.log('Is channel query:', isChannelQuery);
      
      if (isChannelQuery) {
        console.log('Channel query detected, using summarize endpoint...');
        
        const response = await fetch(`${this.assistantUrl}/assistant/summarize/${channel.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: message.content.replace(/@assistant/gi, '').trim(),
            limit: 100
          })
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Assistant service error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          throw new Error(`Assistant service error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Response data:', data);
        return data.response;
      }

      console.log('Normal query detected, getting sender info...');
      // For normal assistant queries
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true
        }
      });

      const requestBody = {
        message: message.content.replace(/@assistant/gi, '').trim(),
        channel_id: channel.id,
        user_id: userId,
        channel_type: this.getChannelType(channel),
        thread_id: message.threadId,
        username: sender?.username || 'User'
      };

      console.log('Sending normal assistant request to:', `${this.assistantUrl}/assistant/chat`);
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(`${this.assistantUrl}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Assistant service error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Assistant service error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Response data:', data);
      return data.response;
    } catch (error) {
      console.error('Assistant service error:', error);
      throw new Error('Failed to get assistant response');
    }
  }
} 