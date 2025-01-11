import { ThreadMessageInput } from '../features/threads/types/thread.types';
import { Message } from '../features/messages/types/message.types';

export const ThreadService = {
  async getThreadMessages(parentMessageId: string): Promise<Message[]> {
    const response = await fetch(`/api/threads/${parentMessageId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch thread messages');
    }
    return response.json();
  },

  async createThreadMessage(data: ThreadMessageInput): Promise<Message> {
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to create thread message');
    }
    return response.json();
  },

  async updateThreadMessage(messageId: string, content: string): Promise<Message> {
    const response = await fetch(`/api/threads/${messageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      throw new Error('Failed to update thread message');
    }
    return response.json();
  }
}; 