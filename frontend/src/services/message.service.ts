import { Message, MessageInput } from '../features/messages/types/message.types';
import { socket } from './socket.service';
import { api } from '../services/api.service';

export class MessageService {
  static async createMessage(data: { content: string; channelId: string; threadId?: string; userId?: string }): Promise<Message> {
        const response = await api.post('/api/messages', {
      content: data.content,
      channelId: data.channelId,
      threadId: data.threadId,
      userId: data.userId
    });
        return response as Message;
  }

  static async updateMessage(messageId: string, content: string): Promise<Message> {
    const response = await api.put(`/api/messages/${messageId}`, {
      content
    });
    return response as Message;
  }

  static async addReaction(messageId: string, emoji: string): Promise<void> {
        await api.post(`/api/messages/${messageId}/reactions`, {
      emoji
    });
  }

  static async removeReaction(messageId: string, emoji: string): Promise<void> {
        await api.delete(`/api/messages/${messageId}/reactions/${emoji}`);
  }

  static async getReactions(messageId: string): Promise<Record<string, Array<{ id: string; username: string }>>> {
    const response = await api.get(`/api/messages/${messageId}/reactions`);
    return response as Record<string, Array<{ id: string; username: string }>>;
  }

  static async getChannelMessages(channelId: string): Promise<Message[]> {
    const response = await api.get(`/api/messages/channel/${channelId}`);
    return response as Message[];
  }
} 