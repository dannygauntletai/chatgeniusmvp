import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', (req, res) => UserController.getUsers(req as unknown as AuthenticatedRequest, res));
router.get('/:userId', (req, res) => UserController.getUserById(req as unknown as AuthenticatedRequest, res));

export default router; 