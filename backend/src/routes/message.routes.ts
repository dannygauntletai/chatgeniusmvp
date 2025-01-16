import { Router, RequestHandler } from 'express';
import { MessageController } from '../controllers/message.controller';
import { AuthenticatedRequest } from '../types/request.types';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes except assistant messages
router.use((req, res, next) => {
  if (req.path === '/assistant' && req.method === 'POST') {
    return next();
  }
  return requireAuth(req, res, next);
});

const handleRequest = (handler: (req: AuthenticatedRequest, res: any, next: any) => Promise<any>): RequestHandler => {
  return (req, res, next) => handler(req as unknown as AuthenticatedRequest, res, next);
};

// Special endpoint for assistant messages - no auth required
router.post('/assistant', handleRequest(MessageController.createAssistantMessage));

// Regular routes that require auth
router.post('/', handleRequest(MessageController.createMessage));
router.get('/channel/:channelId', handleRequest(MessageController.getChannelMessages));
router.put('/:messageId', handleRequest(MessageController.updateMessage));

export default router; 