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

  static async getChannelMessages(channelId: string): Promise<Message[]> {
    const response = await fetch(`/api/messages/channel/${channelId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }
    return response.json();
  }
} 