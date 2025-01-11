import { PrismaClient } from '@prisma/client';
import { MessageUpdateInput } from '../types/message.types';
import { CustomError } from '../utils/errors';

const prisma = new PrismaClient();

export class ThreadService {
  static async createThreadMessage(data: {
    content: string;
    parentMessageId: string;
    userId: string;
  }) {
    try {
      const parentMessage = await prisma.message.findUnique({
        where: { id: data.parentMessageId },
        include: { channel: true }
      });

      if (!parentMessage) {
        throw new CustomError('Parent message not found', 404);
      }

      return await prisma.message.create({
        data: {
          content: data.content,
          userId: data.userId,
          channelId: parentMessage.channelId,
          threadId: data.parentMessageId,
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
    } catch (error) {
      if (error instanceof CustomError) throw error;
      throw new CustomError('Failed to create thread message', 500);
    }
  }

  static async getThreadMessages(parentMessageId: string) {
    try {
      const messages = await prisma.message.findMany({
        where: {
          threadId: parentMessageId,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
      
      return messages;
    } catch (error) {
      if (error instanceof CustomError) throw error;
      throw new CustomError('Failed to fetch thread messages', 500);
    }
  }

  static async updateThreadMessage(messageId: string, userId: string, data: MessageUpdateInput) {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId }
      });

      if (!message) {
        throw new CustomError('Message not found', 404);
      }

      if (message.userId !== userId) {
        throw new CustomError('Not authorized to update this message', 403);
      }

      return await prisma.message.update({
        where: { id: messageId },
        data: { content: data.content },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof CustomError) throw error;
      throw new CustomError('Failed to update thread message', 500);
    }
  }
} 