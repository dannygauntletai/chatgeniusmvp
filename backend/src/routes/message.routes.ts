import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get messages for a channel
router.get('/channel/:channelId', async (req, res, next) => MessageController.getChannelMessages(req, res, next));

// Update message
router.put('/:messageId', async (req, res, next) => MessageController.updateMessage(req, res, next));

// Send a message
router.post('/', async (req, res, next) => MessageController.createMessage(req, res, next));

export default router; 