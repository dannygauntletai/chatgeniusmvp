import { Channel, Message, User } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class AssistantService {
  private assistantUrl = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';

  private getChannelType(channel: Channel): string {
    if (channel.isPrivate) return 'private';
    return 'public';
  }

  async shouldGenerateResponse(channel: Channel, recipientId: string): Promise<boolean> {
    
    // Only generate responses for DM channels
    if (!channel.name.startsWith('dm-')) {
            return false;
    }

        // Get recipient's status
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId }
    });
        
    // Generate response if user is offline
    return recipient?.status === 'offline';
  }

  async generateOfflineResponse(message: Message, offlineUser: User, _channel: Channel): Promise<string> {
                
    try {
      // Get the sender's info for context
      const sender = await prisma.user.findUnique({
        where: { id: message.userId },
        select: {
          username: true
        }
      });

      // For DM responses, use the offline user endpoint
                  
      const response = await fetch(`${this.assistantUrl}/assistant/offline/${offlineUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: message.content,
          sender_name: sender?.username || 'Unknown',
          limit: 100
        })
      });

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
            return data.response;
    } catch (error) {
      console.error('Error generating offline response:', error);
      throw error;
    }
  }

  async getAssistantResponse(message: string, channel: Channel, userId: string, threadId?: string): Promise<string> {
        
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true
      }
    });

    // Check if this is a summarize request
    if (message.toLowerCase().includes('@assistant summarize') || message.toLowerCase().includes('@assistant summary')) {
                const response = await fetch(`${this.assistantUrl}/assistant/summarize/${channel.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: message,
                limit: 100
            })
        });

        if (!response.ok) {
            console.error('Error from assistant service:', response.status, await response.text());
            throw new Error('Failed to get response from assistant service');
        }

        const data = await response.json();
        return data.response;
    } else {
                const response = await fetch(`${this.assistantUrl}/assistant/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                channel_id: channel.id,
                user_id: userId,
                username: sender?.username,
                channel_type: this.getChannelType(channel),
                thread_id: threadId
            })
        });

        if (!response.ok) {
            console.error('Error from assistant service:', response.status, await response.text());
            throw new Error('Failed to get response from assistant service');
        }

        const data = await response.json();
        return data.response;
    }
  }
} 