import { Message, MessageInput } from '../features/messages/types/message.types';
import { socket } from './socket.service';
import { api } from '../services/api.service';

export class MessageService {
  static async createMessage(data: { content: string; channelId?: string; threadId?: string }): Promise<Message> {
    console.log('\n=== FRONTEND: Creating Message ===');
    console.log('Request data:', JSON.stringify(data, null, 2));
    const response = await api.post('/api/messages', data);
    console.log('Response from backend:', JSON.stringify(response, null, 2));
    return response;
  }

  static async updateMessage(messageId: string, content: string): Promise<Message> {
    const response = await api.put(`/api/messages/${messageId}`, {
      content
    });
    return response;
  }

  static async addReaction(messageId: string, emoji: string): Promise<void> {
    console.log('MessageService: Adding reaction', { messageId, emoji });
    await api.post(`/api/messages/${messageId}/reactions`, {
      emoji
    });
  }

  static async removeReaction(messageId: string, emoji: string): Promise<void> {
    console.log('MessageService: Removing reaction', { messageId, emoji });
    await api.delete(`/api/messages/${messageId}/reactions/${emoji}`);
  }

  static async getReactions(messageId: string): Promise<Record<string, Array<{ id: string; username: string }>>> {
    const response = await api.get(`/api/messages/${messageId}/reactions`);
    return response;
  }

  static async getChannelMessages(channelId: string): Promise<Message[]> {
    const response = await api.get(`/api/messages/channel/${channelId}`);
    return response;
  }
} 