import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ReactionService } from '../services/reaction.service';
import { io } from '../app';

export class ReactionController {
  static async handleAddReaction(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;
      const userId = req.auth.userId;

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

  static async handleRemoveReaction(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { messageId, emoji } = req.params;
      const userId = req.auth.userId;

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

  static async handleGetReactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { messageId } = req.params;
      const reactions = await ReactionService.getReactions(messageId);
      res.json(reactions);
    } catch (error) {
      next(error);
    }
  }
} 