import { Message, User, Channel } from '@prisma/client';
import { prisma } from '../lib/prisma';

interface MessageWithUser extends Message {
  user: {
    id: string;
    username: string;
  };
}

const ASSISTANT_SERVICE_URL = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';

export class AIResponseService {
  static async shouldGenerateResponse(channel: Channel, recipientId: string): Promise<boolean> {
    console.log('\n=== AI RESPONSE SERVICE - shouldGenerateResponse ===');
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

  static async getChannelHistory(channelId: string, limit: number = 50): Promise<Message[]> {
    console.log('\n=== AI RESPONSE SERVICE - getChannelHistory ===');
    console.log('Getting history for channel:', channelId);
    
    const messages = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    console.log('Found messages:', messages.length);
    return messages;
  }

  static async getChannelMessages(channelId: string, limit: number = 100): Promise<MessageWithUser[]> {
    console.log('\n=== AI RESPONSE SERVICE - getChannelMessages ===');
    console.log('Getting messages for channel:', channelId);
    
    const messages = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    console.log('Found messages:', messages.length);
    return messages as MessageWithUser[];
  }

  static async generateResponse(message: Message, recipient: User, channel: Channel): Promise<string> {
    console.log('\n=== AI RESPONSE SERVICE - generateResponse ===');
    console.log('Generating response for message:', message.id);
    console.log('Recipient:', recipient.username);
    console.log('Channel:', channel.name);

    try {
      let requestBody;
      
      // Check if this is a channel summary/question request
      if (message.content.toLowerCase().includes('@assistant') && 
          (message.content.toLowerCase().includes('summarize') || 
           message.content.toLowerCase().includes('summary') ||
           message.content.toLowerCase().includes('what') ||
           message.content.toLowerCase().includes('who') ||
           message.content.toLowerCase().includes('when') ||
           message.content.toLowerCase().includes('where') ||
           message.content.toLowerCase().includes('why') ||
           message.content.toLowerCase().includes('how'))) {
        
        console.log('Channel summary/question request detected');
        // Get channel messages for context
        const channelMessages = await this.getChannelMessages(channel.id);
        
        // Format messages for the AI
        const formattedHistory = channelMessages.map(msg => ({
          role: 'message',
          content: msg.content,
          name: msg.user.username,
          timestamp: msg.createdAt
        })).reverse();

        requestBody = {
          message: message.content,
          channel_id: channel.id,
          user_id: recipient.id,
          channel_type: channel.name.startsWith('dm-') ? 'DM' : 'CHANNEL',
          username: recipient.username,
          message_history: formattedHistory,
          context_type: 'channel_query'
        };
      } else {
        // Handle normal DM responses with existing logic
        const userMessages = await prisma.message.findMany({
          where: {
            userId: recipient.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        });
        
        const sender = await prisma.user.findUnique({
          where: { id: message.userId },
          select: {
            id: true,
            username: true
          }
        });
        
        const formattedHistory = [
          ...userMessages.map(msg => ({
            role: 'user',
            content: msg.content,
            name: msg.user.username,
            timestamp: msg.createdAt
          })),
          {
            role: 'incoming',
            content: message.content,
            name: sender?.username || 'unknown',
            timestamp: message.createdAt
          }
        ].reverse();

        requestBody = {
          message: message.content,
          channel_id: channel.id,
          user_id: recipient.id,
          channel_type: 'DM',
          username: recipient.username,
          message_history: formattedHistory,
          persona: {
            id: recipient.id,
            username: recipient.username,
            role: "impersonated_user",
            messages: userMessages.map(msg => ({
              content: msg.content,
              timestamp: msg.createdAt
            })),
            should_analyze_style: true
          }
        };
      }

      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${ASSISTANT_SERVICE_URL}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Assistant service error details:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Assistant service error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('\n=== ASSISTANT SERVICE RESPONSE ===');
      console.log('Response data:', JSON.stringify(data, null, 2));
      return data.response;
    } catch (error) {
      console.error('Error generating AI response:', error);
      throw error;
    }
  }
} 