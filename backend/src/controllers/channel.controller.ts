import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/request.types';
import { prisma } from '../utils/prisma';
import { io } from '../app';

export class ChannelController {
  static async createChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, isPrivate = false, members = [] } = req.body;
      const userId = req.auth.userId;

      console.log('Creating channel:', { name, isPrivate, members, userId });

      if (!name) {
        res.status(400).json({ message: 'Channel name is required' });
        return;
      }

      // For DM channels, ensure both users are included as members
      if (name.startsWith('dm-')) {
        console.log('Creating DM channel...');
        
        // Validate members array
        if (!Array.isArray(members) || members.length !== 2) {
          console.error('Invalid members array:', members);
          res.status(400).json({ message: 'DM channels require exactly two members' });
          return;
        }

        // Get both users' information
        console.log('Finding users:', members);
        const [user1, user2] = await Promise.all([
          prisma.user.findUnique({ where: { id: members[0] } }),
          prisma.user.findUnique({ where: { id: members[1] } })
        ]);

        if (!user1 || !user2) {
          console.error('Users not found:', { user1Id: members[0], user2Id: members[1] });
          res.status(404).json({ message: 'One or both users not found' });
          return;
        }

        console.log('Found users:', { user1: user1.username, user2: user2.username });

        // Generate DM channel name with 'dm-' prefix
        const dmChannelName = `dm-${user1.username}-${user2.username}`;
        console.log('Generated DM channel name:', dmChannelName);

        // Check if DM channel already exists (check both name combinations)
        const alternativeDmChannelName = `dm-${user2.username}-${user1.username}`;
        console.log('Checking for existing channels with names:', { dmChannelName, alternativeDmChannelName });
        
        const existingChannel = await prisma.channel.findFirst({
          where: {
            OR: [
              { name: dmChannelName },
              { name: alternativeDmChannelName }
            ],
            AND: {
              isPrivate: true,
              members: {
                every: {
                  id: {
                    in: [members[0], members[1]]
                  }
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
          console.log('Found existing DM channel:', existingChannel.id);
          res.json(existingChannel);
          return;
        }

        console.log('Creating new DM channel...');
        // Create new DM channel with both users
        try {
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

          console.log('DM channel created successfully:', channel.id);
          io.emit('channel:created', channel);
          res.status(201).json(channel);
          return;
        } catch (error) {
          console.error('Error creating DM channel:', error);
          throw error;
        }
      }

      // For regular channels
      console.log('Creating regular channel...');
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

      console.log('Regular channel created successfully:', channel.id);
      io.emit('channel:created', channel);
      res.status(201).json(channel);
    } catch (error) {
      console.error('Error in createChannel:', error);
      next(error);
    }
  }

  static async joinChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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
        res.status(404).json({ message: 'Channel not found' });
        return;
      }

      const existingMember = channel.members.some((member: { id: string }) => member.id === userId);
      if (existingMember) {
        res.status(400).json({ message: 'Already a member of this channel' });
        return;
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
      res.json(channelWithMemberCount);
    } catch (error) {
      next(error);
    }
  }

  static async leaveChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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
        res.status(404).json({ message: 'Channel not found' });
        return;
      }

      const existingMember = channel.members.some((member: { id: string }) => member.id === userId);
      if (!existingMember) {
        res.status(400).json({ message: 'Not a member of this channel' });
        return;
      }

      if (channel.ownerId === userId) {
        res.status(400).json({ message: 'Channel owner cannot leave the channel' });
        return;
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
      res.json(channelWithMemberCount);
    } catch (error) {
      next(error);
    }
  }

  static async getChannels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log('Getting channels for user:', req.auth?.userId);
      
      const userId = req.auth?.userId;
      if (!userId) {
        console.error('No userId found in auth');
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // Ensure user exists in database
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        console.error('User not found in database:', userId);
        res.status(404).json({ message: 'User not found' });
        return;
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
        try {
          await Promise.all(
            publicChannels.map(async (channel: { id: string }) => {
              const updatedChannel = await prisma.channel.update({
                where: { id: channel.id },
                data: {
                  members: {
                    connect: { id: userId }
                  }
                }
              });
              console.log(`User ${userId} joined channel ${channel.id}`);
              io.emit('channel:member_joined', { channelId: channel.id, user: { id: userId } });
              return updatedChannel;
            })
          );
        } catch (error) {
          console.error('Error auto-joining channels:', error);
          // Continue execution even if auto-join fails
        }
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

      res.json({
        channels,
        directMessages: dms
      });
    } catch (error) {
      console.error('Error in getChannels:', error);
      next(error);
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