import { Router, RequestHandler } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthenticatedRequest } from '../types/request.types';

const router = Router();

const handleRequest = (handler: (req: AuthenticatedRequest, res: any, next: any) => Promise<any>): RequestHandler => {
  return (req, res, next) => handler(req as unknown as AuthenticatedRequest, res, next);
};

router.get('/', handleRequest(UserController.getUsers));
router.get('/:userId', handleRequest(UserController.getUserById));
router.put('/status', handleRequest(UserController.updateUserStatus));

export default router; 