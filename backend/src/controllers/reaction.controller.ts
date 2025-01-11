import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/request.types';
import { ReactionService } from '../services/reaction.service';
import { io } from '../app';

export class ReactionController {
  static async handleAddReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;
      const userId = (req as AuthRequest).user.id;

      const reaction = await ReactionService.addReaction(messageId, userId, emoji);
      
      io.emit('reaction:added', {
        messageId,
        reaction: {
          emoji,
          user: reaction.user
        }
      });

      res.status(201).json(reaction);
    } catch (error) {
      next(error);
    }
  }

  static async handleRemoveReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { messageId, emoji } = req.params;
      const userId = (req as AuthRequest).user.id;

      await ReactionService.removeReaction(messageId, userId, emoji);
      
      io.emit('reaction:removed', {
        messageId,
        emoji,
        userId
      });

      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  }

  static async handleGetReactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { messageId } = req.params;
      const reactions = await ReactionService.getReactions(messageId);
      res.json(reactions);
    } catch (error) {
      next(error);
    }
  }
} 