import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/request.types';
import { prisma } from '../lib/prisma';
import { io } from '../app';

export class MessageController {
  static async createMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { content, channelId } = req.body;
      const userId = (req as AuthRequest).user.id;

      const message = await prisma.message.create({
        data: {
          content,
          channelId,
          userId,
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

      io.to(channelId).emit('message:created', message);
      return res.status(201).json(message);
    } catch (error) {
      return next(error);
    }
  }

  static async updateMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = (req as AuthRequest).user.id;

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

  static async getChannelMessages(req: Request, res: Response, next: NextFunction) {
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
          createdAt: 'desc',
        },
      });
      res.json(messages);
    } catch (error) {
      next(error);
    }
  }
} 