import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/', (req, res, next) => ChannelController.createChannel(req as unknown as AuthenticatedRequest, res, next));
router.get('/', (req, res, next) => ChannelController.getChannels(req as unknown as AuthenticatedRequest, res, next));
router.post('/:channelId/join', (req, res, next) => ChannelController.joinChannel(req as unknown as AuthenticatedRequest, res, next));
router.post('/:channelId/leave', (req, res, next) => ChannelController.leaveChannel(req as unknown as AuthenticatedRequest, res, next));

export default router; 