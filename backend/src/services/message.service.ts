import { Message } from '@prisma/client';
import { prisma } from '../lib/prisma';

const VECTOR_API_URL = process.env.VECTOR_API_URL || 'http://localhost:8001';

interface CreateMessageData {
  content: string;
  userId: string;
  channelId: string;
  threadId?: string;
}

interface UpdateMessageData {
  content: string;
}

export class MessageService {
  async create(data: CreateMessageData): Promise<Message> {
    console.log('\n=== MESSAGE CREATION STARTED ===');
    console.log('Creating message with data:', JSON.stringify(data, null, 2));
    
    const message = await prisma.message.create({
      data: {
        content: data.content,
        userId: data.userId,
        channelId: data.channelId,
        threadId: data.threadId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
    console.log('Message created in database:', JSON.stringify(message, null, 2));

    // Update vector index
    try {
      const url = `${VECTOR_API_URL}/update`;
      const body = JSON.stringify({ message_id: message.id });
      console.log('\n=== VECTOR SERVICE UPDATE REQUEST ===');
      console.log('VECTOR_API_URL env var:', process.env.VECTOR_API_URL);
      console.log('Final URL:', url);
      console.log('Request Body:', body);
      console.log('Starting fetch request...');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body,
      });
      console.log('Fetch request completed');
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vector service error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        return message;
      }

      const result = await response.json();
      console.log('Vector service response:', result);
    } catch (error: any) {
      console.error('Failed to update vector index:', {
        error: error.message,
        stack: error.stack,
        messageId: message.id,
        vectorUrl: `${VECTOR_API_URL}/update`
      });
      // Don't throw error to avoid breaking message creation
    }

    return message;
  }

  async update(id: string, data: UpdateMessageData): Promise<Message> {
    const message = await prisma.message.update({
      where: { id },
      data: {
        content: data.content,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Update vector index
    try {
      await fetch(`${VECTOR_API_URL}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message_id: message.id }),
      });
    } catch (error) {
      console.error('Failed to update vector index:', error);
    }

    return message;
  }

  async delete(id: string): Promise<Message> {
    const message = await prisma.message.delete({
      where: { id },
    });

    // Delete from vector index
    try {
      await fetch(`${VECTOR_API_URL}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message_id: id }),
      });
    } catch (error) {
      console.error('Failed to delete from vector index:', error);
    }

    return message;
  }
} 