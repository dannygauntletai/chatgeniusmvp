import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class UserController {
  static async getUsers(req: AuthenticatedRequest, res: Response) {
    try {
      const users = await prisma.user.findMany({
        where: {
          id: { not: req.auth.userId }
        },
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return res.json(users);
    } catch (error) {
      console.error('Error getting users:', error);
      return res.status(500).json({ error: 'Failed to get users' });
    }
  }

  static async getUserById(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json(user);
    } catch (error) {
      console.error('Error getting user:', error);
      return res.status(500).json({ error: 'Failed to get user' });
    }
  }

  static async updateUserStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { user_status } = req.body;
      
      if (typeof user_status !== 'string') {
        return res.status(400).json({ error: 'Invalid status format' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: req.auth.userId },
        data: { user_status },
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          user_status: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user status:', error);
      return res.status(500).json({ error: 'Failed to update user status' });
    }
  }
} 