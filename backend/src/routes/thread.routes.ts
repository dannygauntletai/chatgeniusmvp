import { Router } from 'express';
import { ThreadController } from '../controllers/thread.controller';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// Get thread messages
router.get('/:parentMessageId', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return ThreadController.getThreadMessages(authReq, res, next);
});

// Create thread message
router.post('/', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return ThreadController.createThreadMessage(authReq, res, next);
});

// Update thread message
router.put('/:messageId', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return ThreadController.updateThreadMessage(authReq, res, next);
});

export default router; 