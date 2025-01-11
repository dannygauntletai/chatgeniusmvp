import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/', async (req, res, next) => ChannelController.createChannel(req, res, next));
router.get('/', async (req, res, next) => ChannelController.getChannels(req, res, next));
router.post('/:channelId/join', async (req, res, next) => ChannelController.joinChannel(req, res, next));
router.post('/:channelId/leave', async (req, res, next) => ChannelController.leaveChannel(req, res, next));

export default router; 