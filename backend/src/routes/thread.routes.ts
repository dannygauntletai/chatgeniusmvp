import { Router, RequestHandler } from 'express';
import { ThreadController } from '../controllers/thread.controller';
import { AuthenticatedRequest } from '../types/request.types';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

const handleRequest = (handler: (req: AuthenticatedRequest, res: any, next: any) => Promise<any>): RequestHandler => {
  return (req, res, next) => handler(req as unknown as AuthenticatedRequest, res, next);
};

router.post('/messages', handleRequest(ThreadController.createThreadMessage));
router.get('/:parentMessageId/messages', handleRequest(ThreadController.getThreadMessages));
router.put('/messages/:messageId', handleRequest(ThreadController.updateThreadMessage));

export default router; 