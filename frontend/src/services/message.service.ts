import { Message, MessageInput } from '../features/messages/types/message.types';
import { socket } from './socket.service';

export class MessageService {
  static async createMessage(data: MessageInput): Promise<Message> {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to create message');
    }

    return response.json();
  }

  static async addReaction(messageId: string, emoji: string): Promise<void> {
    console.log('MessageService: Adding reaction', { messageId, emoji });
    const response = await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        emoji,
        userId: 'test-user-id'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to add reaction:', error);
      throw new Error('Failed to add reaction');
    }
  }

  static async removeReaction(messageId: string, emoji: string): Promise<void> {
    console.log('MessageService: Removing reaction', { messageId, emoji });
    const response = await fetch(`/api/messages/${messageId}/reactions/${emoji}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        userId: 'test-user-id'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to remove reaction:', error);
      throw new Error('Failed to remove reaction');
    }
  }

  static async getReactions(messageId: string): Promise<Record<string, Array<{ id: string; username: string }>>> {
    const response = await fetch(`/api/messages/${messageId}/reactions`);
    
    if (!response.ok) {
      throw new Error('Failed to get reactions');
    }

    return response.json();
  }

  static async getChannelMessages(channelId: string): Promise<Message[]> {
    const response = await fetch(`/api/messages/channel/${channelId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }
    return response.json();
  }
} 