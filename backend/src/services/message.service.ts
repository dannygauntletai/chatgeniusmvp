import { Message } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { io } from '../app';
import { AssistantService } from './assistant.service';

const assistantService = new AssistantService();

interface CreateMessageData {
  content: string;
  userId?: string;
  channelId: string;
  threadId?: string;
  providedUserId?: string;
}

interface UpdateMessageData {
  content: string;
}

export class MessageService {
  private async getRecipientFromDMChannel(channelName: string, senderId: string): Promise<string | null> {
            
    // Extract usernames from DM channel name (format: dm-user1-user2)
    const usernames = channelName.replace('dm-', '').split('-');
        
    // Find both users
    const users = await prisma.user.findMany({
      where: {
        username: {
          in: usernames
        }
      }
    });
    
    // Return the ID of the user that isn't the sender
    const recipient = users.find(user => user.id !== senderId);
        return recipient?.id || null;
  }

  async create(data: CreateMessageData): Promise<Message> {

    // Default to assistant bot ID if no user ID is provided
    const userId = data.providedUserId || data.userId || process.env.ASSISTANT_BOT_USER_ID!;

    const message = await prisma.message.create({
      data: {
        content: data.content,
        userId,
        channelId: data.channelId,
        threadId: data.threadId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        channel: true,
      },
    });

    // Emit socket event for real-time updates
        // Emit to the channel room
    io.to(message.channelId).emit('message:created', message);
    // Also emit to all sockets (needed because sender might not be in room yet)
    io.emit('message:created', message);
    
    // Check if message mentions assistant
    if (message.content.toLowerCase().includes('@assistant')) {
                  
      // Send typing indicator
      io.to(message.channelId).emit('user:typing', {
        channelId: message.channelId,
        userId: process.env.ASSISTANT_BOT_USER_ID,
        typing: true
      });

      const channel = await prisma.channel.findUnique({
        where: { id: message.channelId }
      });
      
      if (!channel) {
                io.to(message.channelId).emit('user:typing', {
          channelId: message.channelId,
          userId: process.env.ASSISTANT_BOT_USER_ID,
          typing: false
        });
        return message;
      }

      console.log('Channel found:', {
        id: channel.id,
        name: channel.name,
        type: channel.isPrivate ? 'private' : 'public'
      });

      try {
        console.log('Calling getAssistantResponse with:', {
          messageId: message.id,
          channelId: channel.id,
          userId: message.userId
        });

        // Get assistant response (handles both normal queries and channel summaries)
        const response = await assistantService.getAssistantResponse(
          message.content,
          channel,
          message.userId
        );

        // Create assistant's response message
        await this.create({
          content: response,
          channelId: message.channelId,
          userId: process.env.ASSISTANT_BOT_USER_ID!, // Bot user ID from env
          threadId: message.threadId || undefined // Maintain thread context if it exists
        });
      } catch (error) {
        console.error('Error getting assistant response:', error);
        // Create error message with explicit assistant user ID
        await this.create({
          content: "I apologize, but I'm having trouble processing your request at the moment. Please try again later.",
          channelId: message.channelId,
          providedUserId: process.env.ASSISTANT_BOT_USER_ID!,  // Explicitly use providedUserId
          threadId: message.threadId || undefined
        });
      } finally {
        // Always stop typing indicator
        io.to(message.channelId).emit('user:typing', {
          channelId: message.channelId,
          userId: process.env.ASSISTANT_BOT_USER_ID,
          typing: false
        });
      }
    }

    if (data.providedUserId === process.env.ASSISTANT_BOT_USER_ID) {
      return message;
    }

    // Check if this is a DM and if we should generate an AI response
    if (message.channel.name.startsWith('dm-') && message.user.id !== process.env.ASSISTANT_BOT_USER_ID) {
                        
      try {
        // Get the recipient using the helper method
                const recipientId = await this.getRecipientFromDMChannel(message.channel.name, message.user.id);
                        
        if (recipientId === process.env.ASSISTANT_BOT_USER_ID) {
                    const response = await assistantService.getAssistantResponse(
            message.content,
            message.channel,
            message.user.id
          );

          // Create assistant's response message
          await this.create({
            content: response,
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID!, // Bot user ID from env
            threadId: message.threadId || undefined // Maintain thread context if it exists
          });
          return message;
        }
        
        if (recipientId) {
                    const shouldRespond = await assistantService.shouldGenerateResponse(message.channel, recipientId);
                    
          if (shouldRespond) {
                        // Get the recipient's user info
            const recipient = await prisma.user.findUnique({
              where: { id: recipientId }
            });
            
            if (recipient) {
                            // Generate response using the user's message history
              const aiResponse = await assistantService.generateOfflineResponse(message, recipient, message.channel);
                            
              if (aiResponse) {
                // Create and emit the AI response message using the offline user's ID
                                await this.create({
                  content: aiResponse,
                  channelId: message.channelId,
                  threadId: message.threadId || undefined,
                  providedUserId: recipientId // Use the offline user's ID
                });
                              }
            }
          }
        }
      } catch (error) {
        console.error('Error handling AI response:', error);
      }
    }
    
    return message;
  }

  async update(id: string, data: UpdateMessageData): Promise<Message> {
    const message = await prisma.message.update({
      where: { id },
      data: {
        content: data.content,
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

    return message;
  }

  async delete(id: string): Promise<Message> {
    const message = await prisma.message.delete({
      where: { id },
    });

    return message;
  }

  static async getChannelMessages(channelId: string) {
    const messages = await prisma.message.findMany({
      where: {
        channelId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group reactions by emoji for each message
    return messages.map(message => {
      const groupedReactions = message.reactions.reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
          acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push(reaction.user);
        return acc;
      }, {} as Record<string, Array<{ id: string; username: string }>>);

      return {
        ...message,
        reactions: groupedReactions,
      };
    });
  }
} 