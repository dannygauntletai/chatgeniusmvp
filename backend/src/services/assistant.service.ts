import { Channel, Message, User } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class AssistantService {
  private assistantUrl = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';

  private getChannelType(channel: Channel): string {
    if (channel.isPrivate) return 'private';
    return 'public';
  }

  async shouldGenerateResponse(channel: Channel, recipientId: string): Promise<boolean> {
    console.log('\n=== ASSISTANT SERVICE - shouldGenerateResponse ===');
    console.log('Channel:', JSON.stringify(channel, null, 2));
    console.log('RecipientId:', recipientId);

    // Only generate responses for DM channels
    if (!channel.name.startsWith('dm-')) {
      console.log('Not a DM channel, skipping AI response');
      return false;
    }

    console.log('Looking up recipient in database...');
    // Get recipient's status
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId }
    });

    console.log('Recipient from database:', JSON.stringify(recipient, null, 2));
    console.log('Recipient status:', recipient?.status);
    console.log('Should generate response:', recipient?.status === 'offline');

    // Generate response if user is offline
    return recipient?.status === 'offline';
  }

  async generateOfflineResponse(message: Message, offlineUser: User, channel: Channel): Promise<string> {
    console.log('\n=== ASSISTANT SERVICE - generateOfflineResponse ===');
    console.log('Generating offline response for message:', message.id);
    console.log('Offline user:', offlineUser.username);
    console.log('Channel:', channel.name);

    try {
      // Get the sender's info for context
      const sender = await prisma.user.findUnique({
        where: { id: message.userId },
        select: {
          username: true
        }
      });

      // For DM responses, use the offline user endpoint
      console.log('Using offline user endpoint for DM response');
      console.log('Offline user ID:', offlineUser.id);
      
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
      console.log('Response data:', data);
      return data.response;
    } catch (error) {
      console.error('Error generating offline response:', error);
      throw error;
    }
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
      // Check if this is a channel query (summarize, etc.)
      const isChannelQuery = message.content.toLowerCase().includes('summarize') || 
        message.content.toLowerCase().includes('summary') ||
        message.content.toLowerCase().includes('what') ||
        message.content.toLowerCase().includes('who') ||
        message.content.toLowerCase().includes('when') ||
        message.content.toLowerCase().includes('where') ||
        message.content.toLowerCase().includes('why') ||
        message.content.toLowerCase().includes('how');

      console.log('Is channel query:', isChannelQuery);
      
      // Use summarize endpoint for channel queries
      if (isChannelQuery) {
        console.log('Using summarize endpoint for channel query...');
        
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

      // For direct messages to the assistant
      console.log('Using chat endpoint for direct assistant interaction...');
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

      console.log('Sending request to:', `${this.assistantUrl}/assistant/chat`);
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