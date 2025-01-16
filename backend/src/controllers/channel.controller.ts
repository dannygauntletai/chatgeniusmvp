import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/request.types';
import { prisma } from '../utils/prisma';
import { io } from '../app';

const PUBLIC_BUCKET_NAME = 'Public Files';

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

      console.log('Leave channel request:', { channelId, userId });

      // First check the current membership status
      const initialCheck = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          members: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      if (!initialCheck) {
        console.log('Channel not found during initial check:', channelId);
        res.status(404).json({ message: 'Channel not found' });
        return;
      }

      console.log('Initial membership status:', {
        channelId,
        userId,
        isMember: initialCheck?.members.some(m => m.id === userId),
        currentMembers: initialCheck?.members.map(m => ({ id: m.id, username: m.username }))
      });

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          members: true,
          owner: true
        }
      });

      if (!channel) {
        console.log('Channel not found:', channelId);
        res.status(404).json({ message: 'Channel not found' });
        return;
      }

      const existingMember = channel.members.some((member: { id: string }) => member.id === userId);
      console.log('Membership check:', { 
        existingMember, 
        memberCount: channel.members.length,
        isOwner: channel.ownerId === userId
      });

      if (!existingMember) {
        console.log('User not a member:', { userId, channelId });
        res.status(400).json({ message: 'Not a member of this channel' });
        return;
      }

      if (channel.ownerId === userId) {
        console.log('Owner attempted to leave:', { userId, channelId });
        res.status(400).json({ message: 'Channel owner cannot leave the channel' });
        return;
      }

      try {
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
            },
            owner: true,
            _count: {
              select: { members: true }
            }
          }
        });

        console.log('Channel updated successfully:', {
          channelId,
          newMemberCount: updatedChannel._count.members,
          memberIds: updatedChannel.members.map(m => m.id)
        });

        io.emit('channel:member_left', { 
          channelId, 
          userId,
          memberCount: updatedChannel._count?.members || 0
        });

        res.json(updatedChannel);
      } catch (error) {
        console.error('Prisma error during channel update:', error);
        next(error);
      }
    } catch (error) {
      console.error('Error in leaveChannel:', error);
      next(error);
    }
  }

  static async getChannels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.auth?.userId;
      const { page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      console.log('Fetching channels for user:', userId);

      // Check if this is the user's first login by looking for any channel membership
      const userChannelCount = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          _count: {
            select: {
              channels: true
            }
          }
        }
      });

      // Only auto-join public channels if user has no channel memberships
      if (userChannelCount?._count.channels === 0) {
        console.log('First login detected - auto-joining public channels');
        
        // Find all public channels except the public files channel
        const publicChannels = await prisma.channel.findMany({
          where: {
            isPrivate: false,
            name: { 
              not: { 
                in: ['dm-', PUBLIC_BUCKET_NAME]
              }
            }
          }
        });

        // Add user to all public channels
        if (publicChannels.length > 0) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              channels: {
                connect: publicChannels.map(channel => ({ id: channel.id }))
              }
            }
          });
        }
      }

      // Single query to get both channels and DMs with pagination
      const [channels, dms] = await Promise.all([
        prisma.channel.findMany({
          where: {
            AND: [
              { members: { some: { id: userId } } },
              { name: { 
                not: { 
                  startsWith: 'dm-'
                }
              }},
              { name: {
                not: PUBLIC_BUCKET_NAME
              }}
            ]
          },
          include: {
            members: {
              select: {
                id: true,
                username: true,
                user_status: true
              }
            },
            owner: {
              select: {
                id: true,
                username: true
              }
            },
            _count: {
              select: { members: true }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          },
          take: Number(limit),
          skip
        }),
        prisma.channel.findMany({
          where: {
            AND: [
              { name: { startsWith: 'dm-' } },
              { members: { some: { id: userId } } }
            ]
          },
          include: {
            members: {
              select: {
                id: true,
                username: true,
                user_status: true
              }
            },
            owner: {
              select: {
                id: true,
                username: true
              }
            },
            _count: {
              select: { members: true }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          },
          take: Number(limit),
          skip
        })
      ]);

      console.log('Found channels:', {
        regularChannels: channels.map(c => ({ id: c.id, memberCount: c._count?.members })),
        dmChannels: dms.map(d => ({ id: d.id, memberCount: d._count?.members }))
      });

      res.json({
        channels,
        directMessages: dms,
        pagination: {
          page: Number(page),
          limit: Number(limit)
        }
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

  static async deleteChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { channelId } = req.params;
      const userId = req.auth.userId;

      console.log('Delete channel request:', { channelId, userId });

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
          owner: true,
          members: {
            select: {
              id: true
            }
          }
        }
      });

      if (!channel) {
        console.log('Channel not found:', channelId);
        res.status(404).json({ message: 'Channel not found' });
        return;
      }

      if (channel.ownerId !== userId) {
        console.log('Non-owner attempted to delete channel:', { userId, ownerId: channel.ownerId });
        res.status(403).json({ message: 'Only the channel owner can delete the channel' });
        return;
      }

      // Delete in correct order to handle foreign key constraints
      console.log('Starting channel deletion process...');

      // 1. Delete all reactions for messages in this channel
      await prisma.reaction.deleteMany({
        where: {
          message: {
            channelId: channelId
          }
        }
      });
      console.log('Deleted all reactions in channel');

      // 2. Delete all messages in this channel (this will cascade to thread messages)
      await prisma.message.deleteMany({
        where: {
          channelId: channelId
        }
      });
      console.log('Deleted all messages in channel');

      // 3. Finally delete the channel
      await prisma.channel.delete({
        where: { id: channelId }
      });

      console.log('Channel deleted successfully:', channelId);

      // Notify all members that the channel was deleted
      io.emit('channel:deleted', { 
        channelId,
        memberIds: channel.members.map(m => m.id)
      });

      res.json({ message: 'Channel deleted successfully' });
    } catch (error) {
      console.error('Error in deleteChannel:', error);
      next(error);
    }
  }

  static async getPublicChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.auth.userId;

      // Get or create public bucket
      let publicBucket = await prisma.channel.findFirst({
        where: { name: PUBLIC_BUCKET_NAME }
      });

      // Create public bucket if it doesn't exist
      if (!publicBucket) {
        publicBucket = await prisma.channel.create({
          data: {
            name: PUBLIC_BUCKET_NAME,
            isPrivate: false,
            ownerId: userId,
            members: {
              connect: { id: userId }
            }
          }
        });
      } else {
        // Check if user is a member
        const isMember = await prisma.channel.findFirst({
          where: {
            id: publicBucket.id,
            members: {
              some: { id: userId }
            }
          }
        });

        // Add user as member if not already
        if (!isMember) {
          await prisma.channel.update({
            where: { id: publicBucket.id },
            data: {
              members: {
                connect: { id: userId }
              }
            }
          });
        }
      }

      res.json(publicBucket);
    } catch (error) {
      next(error);
    }
  }
} 