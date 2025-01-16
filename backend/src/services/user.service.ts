import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ClerkUserData {
  id: string;
  username: string;
  email?: string;
}

export class UserService {
  static async findOrCreateUser(userData: ClerkUserData) {
    try {
      let user = await prisma.user.findUnique({
        where: { id: userData.id }
      });

      if (!user) {
        const defaultStatus = userData.id === process.env.ASSISTANT_BOT_USER_ID ? 'online' : 'offline';
        user = await prisma.user.create({
          data: {
            id: userData.id,
            username: userData.username,
            email: userData.email || null,
            status: defaultStatus
          }
        });
      } else if (userData.id === process.env.ASSISTANT_BOT_USER_ID && user.status !== 'online') {
        user = await prisma.user.update({
          where: { id: userData.id },
          data: { status: 'online' }
        });
      }

      return user;
    } catch (error) {
      console.error('Error in findOrCreateUser:', error);
      throw error;
    }
  }

  static async updateUserStatus(userId: string, status: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { status }
    });
  }
} 