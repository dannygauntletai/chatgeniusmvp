import { Router } from 'express';
import { ThreadController } from '../controllers/thread.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get thread messages
router.get('/:parentMessageId', async (req, res, next) => ThreadController.getThreadMessages(req, res, next));

// Create thread message
router.post('/', async (req, res, next) => ThreadController.createThreadMessage(req, res, next));

// Update thread message
router.put('/:messageId', async (req, res, next) => ThreadController.updateThreadMessage(req, res, next));

export default router; 