import { PrismaClient } from '@prisma/client';
import { CustomError } from '../utils/errors';

const prisma = new PrismaClient();

export class ReactionService {
  static async addReaction(messageId: string, userId: string, emoji: string) {
    try {
      const reaction = await prisma.reaction.create({
        data: {
          emoji,
          userId,
          messageId,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
      return reaction;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new CustomError('Reaction already exists', 400);
      }
      throw error;
    }
  }

  static async removeReaction(messageId: string, userId: string, emoji: string) {
    const reaction = await prisma.reaction.delete({
      where: {
        userId_messageId_emoji: {
          userId,
          messageId,
          emoji,
        },
      },
    });
    return reaction;
  }

  static async getReactions(messageId: string) {
    const reactions = await prisma.reaction.findMany({
      where: {
        messageId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Group reactions by emoji
    const groupedReactions = reactions.reduce((acc: Record<string, any[]>, reaction: { emoji: string; user: { id: string; username: string } }) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = [];
      }
      acc[reaction.emoji].push(reaction.user);
      return acc;
    }, {} as Record<string, Array<{ id: string; username: string }>>);

    return groupedReactions;
  }
} 