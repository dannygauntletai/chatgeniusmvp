import { Router, RequestHandler } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { AuthenticatedRequest } from '../types/request.types';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

const handleRequest = (handler: (req: AuthenticatedRequest, res: any, next: any) => Promise<any>): RequestHandler => {
  return (req, res, next) => handler(req as unknown as AuthenticatedRequest, res, next);
};

router.post('/', handleRequest(ChannelController.createChannel));
router.get('/', handleRequest(ChannelController.getChannels));
router.post('/:channelId/join', handleRequest(ChannelController.joinChannel));
router.post('/:channelId/invite', handleRequest(ChannelController.inviteToChannel));
router.post('/:channelId/leave', handleRequest(ChannelController.leaveChannel));
router.post('/:channelId/remove-member', handleRequest(ChannelController.removeMember));
router.delete('/:channelId', handleRequest(ChannelController.deleteChannel));

export default router; 