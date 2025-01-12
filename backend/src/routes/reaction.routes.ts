import { Router } from 'express';
import { ReactionController } from '../controllers/reaction.controller';
import { AuthenticatedRequest } from '../types/request.types';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// All reaction routes require authentication
router.use(requireAuth);

// Add a reaction to a message
router.post('/:messageId/reactions', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return ReactionController.handleAddReaction(authReq, res, next);
});

// Remove a reaction from a message
router.delete('/:messageId/reactions/:emoji', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return ReactionController.handleRemoveReaction(authReq, res, next);
});

// Get all reactions for a message
router.get('/:messageId/reactions', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return ReactionController.handleGetReactions(authReq, res, next);
});

export default router; 