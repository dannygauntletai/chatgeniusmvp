import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// Get messages for a channel
router.get('/channel/:channelId', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return MessageController.getChannelMessages(authReq, res, next);
});

// Update message
router.put('/:messageId', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return MessageController.updateMessage(authReq, res, next);
});

// Send a message
router.post('/', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return MessageController.createMessage(authReq, res, next);
});

export default router; 