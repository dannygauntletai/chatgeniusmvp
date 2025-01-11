import { PrismaClient } from '@prisma/client';
import { MessageCreateInput, MessageUpdateInput } from '../types/message.types';
import { CustomError } from '../utils/errors';

const prisma = new PrismaClient();

export class MessageService {
  static async createMessage(data: MessageCreateInput) {
    try {
      const { channelId, userId } = data;
      
      // Verify channel exists and user is a member
      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          members: {
            some: {
              id: userId
            }
          }
        }
      });

      if (!channel) {
        throw new CustomError('Channel not found or user not a member', 404);
      }

      return await prisma.message.create({
        data: {
          content: data.content,
          channelId: data.channelId,
          userId: data.userId,
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
      throw new CustomError('Failed to create message', 500);
    }
  }

  static async getChannelMessages(channelId: string) {
    try {
      const messages = await prisma.message.findMany({
        where: {
          channelId,
          threadId: null, // Only get main messages, not replies
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          _count: {
            select: {
              replies: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      
      return messages;
    } catch (error) {
      if (error instanceof CustomError) throw error;
      throw new CustomError('Failed to fetch messages', 500);
    }
  }

  static async updateMessage(messageId: string, userId: string, data: MessageUpdateInput) {
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
      throw new CustomError('Failed to update message', 500);
    }
  }
} 