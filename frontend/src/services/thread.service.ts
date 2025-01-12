import { ThreadMessageInput } from '../features/threads/types/thread.types';
import { Message } from '../features/messages/types/message.types';
import { api } from './api.service';

export const ThreadService = {
  async getThreadMessages(parentMessageId: string): Promise<Message[]> {
    return api.get(`/api/threads/${parentMessageId}`);
  },

  async createThreadMessage(data: ThreadMessageInput): Promise<Message> {
    return api.post('/api/threads', data);
  },

  async updateThreadMessage(messageId: string, content: string): Promise<Message> {
    return api.put(`/api/threads/${messageId}`, { content });
  }
}; 