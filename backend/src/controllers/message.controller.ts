import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { io } from '../app';
import { MessageService } from '../services/message.service';

export class MessageController {
  static async createMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { content, channelId, threadId } = req.body;
      const userId = req.auth.userId;

      if (!content || !channelId) {
        return res.status(400).json({ message: 'Content and channelId are required' });
      }

      const messageService = new MessageService();
      const message = await messageService.create({
        content,
        channelId,
        userId,
        threadId,
      });

      io.to(channelId).emit('message:created', message);
      return res.status(201).json(message);
    } catch (error) {
      return next(error);
    }
  }

  static async updateMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.auth.userId;

      const message = await prisma.message.update({
        where: { 
          id: messageId,
          userId
        },
        data: { content },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
      res.json(message);
    } catch (error) {
      next(error);
    }
  }

  static async getChannelMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;
      const messages = await prisma.message.findMany({
        where: {
          channelId,
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
      res.json(messages);
    } catch (error) {
      next(error);
    }
  }
} 