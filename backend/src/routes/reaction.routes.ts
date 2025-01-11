import { Router } from 'express';
import { ReactionController } from '../controllers/reaction.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All reaction routes require authentication
router.use(authenticateToken);

// Add a reaction to a message
router.post('/:messageId/reactions', ReactionController.handleAddReaction);

// Remove a reaction from a message
router.delete('/:messageId/reactions/:emoji', ReactionController.handleRemoveReaction);

// Get all reactions for a message
router.get('/:messageId/reactions', ReactionController.handleGetReactions);

export default router; 