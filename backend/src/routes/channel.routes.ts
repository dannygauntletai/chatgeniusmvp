import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { AuthenticatedRequest } from '../types/request.types';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

router.post('/', (req, res, next) => ChannelController.createChannel(req as unknown as AuthenticatedRequest, res, next));
router.get('/', (req, res, next) => ChannelController.getChannels(req as unknown as AuthenticatedRequest, res, next));
router.post('/:channelId/join', (req, res, next) => ChannelController.joinChannel(req as unknown as AuthenticatedRequest, res, next));
router.post('/:channelId/invite', (req, res, next) => ChannelController.inviteToChannel(req as unknown as AuthenticatedRequest, res, next));
router.post('/:channelId/leave', (req, res, next) => {
  console.log('Leave channel route hit:', {
    channelId: req.params.channelId,
    userId: (req as unknown as AuthenticatedRequest).auth?.userId
  });
  return ChannelController.leaveChannel(req as unknown as AuthenticatedRequest, res, next);
});
router.post('/:channelId/remove-member', (req, res, next) => ChannelController.removeMember(req as unknown as AuthenticatedRequest, res, next));
router.delete('/:channelId', (req, res, next) => ChannelController.deleteChannel(req as unknown as AuthenticatedRequest, res, next));

export default router; 