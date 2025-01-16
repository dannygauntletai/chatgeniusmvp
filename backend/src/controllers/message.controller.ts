import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { io } from '../app';
import { MessageService } from '../services/message.service';

export class MessageController {
  static async createMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      console.log('=== CREATE MESSAGE START ===');
      const { content, channelId, threadId, userId: providedUserId } = req.body;
      const ASSISTANT_BOT_USER_ID = process.env.ASSISTANT_BOT_USER_ID || 'assistant-bot';
      
      console.log('Request body:', req.body);
      console.log('Auth userId:', req.auth?.userId);
      console.log('Provided userId:', providedUserId);
      console.log('Assistant bot ID:', ASSISTANT_BOT_USER_ID);
      
      // Use provided userId if it's the assistant, otherwise use the authenticated user's ID
      const userId = providedUserId === ASSISTANT_BOT_USER_ID ? ASSISTANT_BOT_USER_ID : req.auth.userId;
      console.log('Final userId to use:', userId);

      if (!content || !channelId) {
        console.log('Missing required fields');
        return res.status(400).json({ message: 'Content and channelId are required' });
      }

      const messageService = new MessageService();
      const message = await messageService.create({
        content,
        channelId,
        userId,
        threadId,
      });

      console.log('Message created:', message);
      io.to(channelId).emit('message:created', message);
      return res.status(201).json(message);
    } catch (error) {
      console.error('Error in createMessage:', error);
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

  static async createAssistantMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      console.log('=== CREATE ASSISTANT MESSAGE START ===');
      const { content, channelId, threadId, userId } = req.body;
      const ASSISTANT_BOT_USER_ID = process.env.ASSISTANT_BOT_USER_ID || 'assistant-bot';
      
      console.log('Request body:', req.body);
      
      // Verify this is actually the assistant
      if (userId !== ASSISTANT_BOT_USER_ID) {
        console.log('Invalid userId for assistant message');
        return res.status(403).json({ error: 'Only the assistant can use this endpoint' });
      }

      if (!content || !channelId) {
        console.log('Missing required fields');
        return res.status(400).json({ message: 'Content and channelId are required' });
      }

      const messageService = new MessageService();
      const message = await messageService.create({
        content,
        channelId,
        userId,
        threadId
      });

      console.log('Assistant message created:', message);
      io.to(channelId).emit('message:created', message);
      return res.status(201).json(message);
    } catch (error) {
      console.error('Error in createAssistantMessage:', error);
      return next(error);
    }
  }
} 