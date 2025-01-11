import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/request.types';
import { prisma } from '../lib/prisma';
import { io } from '../app';
import { Member } from '../types/channel.types';

export class ChannelController {
  static async createChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, isPrivate = false } = req.body;
      const userId = (req as AuthRequest).user.id;

      const channel = await prisma.channel.create({
        data: {
          name,
          isPrivate,
          ownerId: userId,
          members: {
            connect: { id: userId }
          }
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true
            }
          },
          members: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      io.emit('channel:created', channel);
      return res.status(201).json(channel);
    } catch (error) {
      return next(error);
    }
  }

  static async joinChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;
      const userId = (req as AuthRequest).user.id;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { members: true }
      });

      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      if (channel.members.some((m: Member) => m.id === userId)) {
        return res.json(channel);
      }

      if (channel.isPrivate && channel.ownerId !== userId) {
        return res.status(403).json({ error: 'Cannot join private channel' });
      }

      const updatedChannel = await prisma.channel.update({
        where: { id: channelId },
        data: {
          members: {
            connect: { id: userId }
          }
        },
        include: {
          members: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      io.to(channelId).emit('channel:member_joined', {
        channelId,
        user: {
          id: userId,
          username: updatedChannel.members.find((m: { id: string; username: string }) => m.id === userId)?.username
        }
      });
      return res.json(updatedChannel);
    } catch (error) {
      return next(error);
    }
  }

  static async leaveChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;
      const userId = (req as AuthRequest).user.id;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { members: true }
      });

      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      if (channel.ownerId === userId) {
        return res.status(403).json({ error: 'Channel owner cannot leave' });
      }

      if (channel.members.some((m: Member) => m.id === userId)) {
        const updatedChannel = await prisma.channel.update({
          where: { id: channelId },
          data: {
            members: {
              disconnect: { id: userId }
            }
          },
          include: {
            members: {
              select: {
                id: true,
                username: true
              }
            }
          }
        });

        io.to(channelId).emit('channel:member_left', {
          channelId,
          userId
        });
        return res.json(updatedChannel);
      }

      return res.json(channel);
    } catch (error) {
      return next(error);
    }
  }

  static async getChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as AuthRequest).user.id;

      const channels = await prisma.channel.findMany({
        where: {
          OR: [
            { isPrivate: false },
            {
              members: {
                some: { id: userId }
              }
            }
          ]
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true
            }
          },
          _count: {
            select: { members: true }
          }
        }
      });

      return res.json(channels);
    } catch (error) {
      return next(error);
    }
  }
} 