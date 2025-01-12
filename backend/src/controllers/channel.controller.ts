import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/request.types';
import { prisma } from '../utils/prisma';
import { io } from '../app';

export class ChannelController {
  static async createChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, isPrivate = false, members = [] } = req.body;
      const userId = req.auth.userId;

      if (!name) {
        res.status(400).json({ message: 'Channel name is required' });
        return;
      }

      // For DM channels, ensure both users are included as members
      if (name.startsWith('dm-')) {
        // Validate members array
        if (!Array.isArray(members) || members.length !== 2) {
          res.status(400).json({ message: 'DM channels require exactly two members' });
          return;
        }

        // Get both users' information
        const [user1, user2] = await Promise.all([
          prisma.user.findUnique({ where: { id: members[0] } }),
          prisma.user.findUnique({ where: { id: members[1] } })
        ]);

        if (!user1 || !user2) {
          res.status(404).json({ message: 'One or both users not found' });
          return;
        }

        // Sort usernames alphabetically to ensure consistent channel naming
        const sortedUsernames = [user1.username, user2.username].sort();
        const dmChannelName = `dm-${sortedUsernames[0]}-${sortedUsernames[1]}`;

        // Check if DM channel already exists
        const existingChannel = await prisma.channel.findFirst({
          where: {
            name: dmChannelName,
            isPrivate: true,
            members: {
              every: {
                id: {
                  in: [members[0], members[1]]
                }
              }
            }
          },
          include: {
            members: true,
            owner: true,
            _count: {
              select: { members: true }
            }
          }
        });

        if (existingChannel) {
          res.json(existingChannel);
          return;
        }

        // Create new DM channel with both users
        const channel = await prisma.channel.create({
          data: {
            name: dmChannelName,
            isPrivate: true,
            owner: {
              connect: { id: members[0] }
            },
            members: {
              connect: [{ id: members[0] }, { id: members[1] }]
            }
          },
          include: {
            members: true,
            owner: true,
            _count: {
              select: { members: true }
            }
          }
        });

        io.emit('channel:created', channel);
        res.status(201).json(channel);
        return;
      }

      // For regular channels
      const channel = await prisma.channel.create({
        data: {
          name,
          isPrivate: isPrivate || false,
          owner: {
            connect: { id: userId }
          },
          members: {
            connect: { id: userId }
          }
        },
        include: {
          members: true,
          owner: true,
          _count: {
            select: { members: true }
          }
        }
      });

      io.emit('channel:created', channel);
      res.status(201).json(channel);
    } catch (error) {
      next(error);
    }
  }

  static async joinChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { channelId } = req.params;
      const userId = req.auth.userId;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          members: true,
          owner: true
        }
      });

      if (!channel) {
        return res.status(404).json({ message: 'Channel not found' });
      }

      const existingMember = channel.members.some((member: { id: string }) => member.id === userId);
      if (existingMember) {
        return res.status(400).json({ message: 'Already a member of this channel' });
      }

      const updatedChannel = await prisma.channel.update({
        where: { id: channelId },
        data: {
          members: {
            connect: { id: userId }
          }
        },
        include: {
          members: true,
          owner: true
        }
      });

      const channelWithMemberCount = {
        ...updatedChannel,
        memberCount: updatedChannel.members.length
      };

      io.emit('channel:updated', channelWithMemberCount);
      return res.json(channelWithMemberCount);
    } catch (error) {
      return next(error);
    }
  }

  static async leaveChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { channelId } = req.params;
      const userId = req.auth.userId;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          members: true,
          owner: true
        }
      });

      if (!channel) {
        return res.status(404).json({ message: 'Channel not found' });
      }

      const existingMember = channel.members.some((member: { id: string }) => member.id === userId);
      if (!existingMember) {
        return res.status(400).json({ message: 'Not a member of this channel' });
      }

      if (channel.ownerId === userId) {
        return res.status(400).json({ message: 'Channel owner cannot leave the channel' });
      }

      const updatedChannel = await prisma.channel.update({
        where: { id: channelId },
        data: {
          members: {
            disconnect: { id: userId }
          }
        },
        include: {
          members: true,
          owner: true
        }
      });

      const channelWithMemberCount = {
        ...updatedChannel,
        memberCount: updatedChannel.members.length
      };

      io.emit('channel:updated', channelWithMemberCount);
      return res.json(channelWithMemberCount);
    } catch (error) {
      return next(error);
    }
  }

  static async getChannels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      console.log('Getting channels for user:', req.auth?.userId);
      
      const userId = req.auth?.userId;
      if (!userId) {
        console.error('No userId found in auth');
        return res.status(401).json({ message: 'User not authenticated' });
      }

      // First, get all public channels
      const publicChannels = await prisma.channel.findMany({
        where: {
          AND: [
            { isPrivate: false },
            { name: { not: { startsWith: 'dm-' } } }
          ]
        },
        include: {
          members: true,
          owner: true,
          _count: {
            select: { members: true }
          }
        }
      });

      console.log('Found public channels:', publicChannels.length);

      // Check if user has any channel memberships (indicating they've logged in before)
      const existingMemberships = await prisma.channel.findMany({
        where: {
          members: {
            some: { id: userId }
          }
        },
        select: { id: true }
      });

      console.log('Found existing memberships:', existingMemberships.length);

      // Only auto-join public channels if this is the user's first login (no existing memberships)
      if (existingMemberships.length === 0) {
        await Promise.all(
          publicChannels.map(async (channel: { id: string }) => {
            await prisma.channel.update({
              where: { id: channel.id },
              data: {
                members: {
                  connect: { id: userId }
                }
              }
            });
            io.emit('channel:member_joined', { channelId: channel.id, user: { id: userId } });
          })
        );
      }

      // Now get all channels the user has access to (including the ones they were just added to)
      const channels = await prisma.channel.findMany({
        where: {
          AND: [
            { members: { some: { id: userId } } },
            { name: { not: { startsWith: 'dm-' } } }
          ]
        },
        include: {
          members: true,
          owner: true,
          _count: {
            select: { members: true }
          }
        }
      });

      const dms = await prisma.channel.findMany({
        where: {
          AND: [
            { name: { startsWith: 'dm-' } },
            { members: { some: { id: userId } } }
          ]
        },
        include: {
          members: true,
          owner: true,
          _count: {
            select: { members: true }
          }
        }
      });

      return res.json({
        channels,
        directMessages: dms
      });
    } catch (error) {
      console.error('Error in getChannels:', error);
      return next(error);
    }
  }

  static async inviteToChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { channelId } = req.params;
      const { userId } = req.body;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          members: true,
          owner: true
        }
      });

      if (!channel) {
        return res.status(404).json({ message: 'Channel not found' });
      }

      if (!channel.isPrivate) {
        return res.status(400).json({ message: 'Cannot invite to public channel' });
      }

      const existingMember = channel.members.some((member: { id: string }) => member.id === userId);
      if (existingMember) {
        return res.status(400).json({ message: 'User is already a member of this channel' });
      }

      const updatedChannel = await prisma.channel.update({
        where: { id: channelId },
        data: {
          members: {
            connect: { id: userId }
          }
        },
        include: {
          members: true,
          owner: true,
          _count: {
            select: { members: true }
          }
        }
      });

      io.emit('channel:member_joined', { channelId, user: { id: userId } });
      return res.json(updatedChannel);
    } catch (error) {
      return next(error);
    }
  }

  static async removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { channelId } = req.params;
      const { userId: memberIdToRemove } = req.body;
      const requestingUserId = req.auth.userId;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          members: true,
          owner: true
        }
      });

      if (!channel) {
        return res.status(404).json({ message: 'Channel not found' });
      }

      // Check if requesting user is the channel owner
      if (channel.ownerId !== requestingUserId) {
        return res.status(403).json({ message: 'Only channel owner can remove members' });
      }

      // Check if user to remove exists in channel
      const existingMember = channel.members.some((member: { id: string }) => member.id === memberIdToRemove);
      if (!existingMember) {
        return res.status(400).json({ message: 'User is not a member of this channel' });
      }

      // Cannot remove the owner
      if (memberIdToRemove === channel.ownerId) {
        return res.status(400).json({ message: 'Cannot remove channel owner' });
      }

      const updatedChannel = await prisma.channel.update({
        where: { id: channelId },
        data: {
          members: {
            disconnect: { id: memberIdToRemove }
          }
        },
        include: {
          members: true,
          owner: true,
          _count: {
            select: { members: true }
          }
        }
      });

      io.emit('channel:member_left', { channelId, userId: memberIdToRemove });
      return res.json(updatedChannel);
    } catch (error) {
      return next(error);
    }
  }
} 