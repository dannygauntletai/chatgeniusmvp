import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthenticatedRequest } from '../types/request.types';

const router = Router();

router.get('/', (req, res) => UserController.getUsers(req as unknown as AuthenticatedRequest, res));
router.get('/:userId', (req, res) => UserController.getUserById(req as unknown as AuthenticatedRequest, res));
router.put('/status', (req, res) => UserController.updateUserStatus(req as unknown as AuthenticatedRequest, res));

export default router; 