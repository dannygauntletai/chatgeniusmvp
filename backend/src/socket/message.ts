import { Socket } from 'socket.io';
import { AssistantService } from '../services/assistant.service';
import { prisma } from '../lib/prisma';
import { MessageService } from '../services/message.service';

const assistantService = new AssistantService();
const messageService = new MessageService();

export const handleMessageEvents = (socket: Socket) => {
  socket.on('message:create', async (data) => {
    try {
      // Create the message first
      const message = await messageService.create(data);
      
      // Check if message mentions assistant
      if (message.content.toLowerCase().includes('@assistant')) {
                        
        // Send typing indicator
        socket.to(message.channelId).emit('user:typing', {
          channelId: message.channelId,
          userId: process.env.ASSISTANT_BOT_USER_ID,
          typing: true
        });

        const channel = await prisma.channel.findUnique({
          where: { id: message.channelId }
        });
        
        if (!channel) {
                    socket.to(message.channelId).emit('user:typing', {
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID,
            typing: false
          });
          return;
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
            userId: socket.data.userId
          });

          // Get assistant response (handles both normal queries and channel summaries)
          const response = await assistantService.getAssistantResponse(
            message.content,
            channel,
            socket.data.userId
          );

          // Create assistant's response message and let MessageService handle the emission
          await messageService.create({
            content: response,
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID!, // Bot user ID from env
            threadId: message.threadId || undefined // Maintain thread context if it exists
          });
        } catch (error) {
          console.error('Error getting assistant response:', error);
          // Create error message
          await messageService.create({
            content: "I apologize, but I'm having trouble processing your request at the moment. Please try again later.",
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID!,
            threadId: message.threadId || undefined
          });
        } finally {
          // Always stop typing indicator
          socket.to(message.channelId).emit('user:typing', {
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID,
            typing: false
          });
        }
      }
    } catch (error) {
      console.error('Error in message:create handler:', error);
    }
  });

  socket.on('channel:join', (channelId: string) => {
    socket.join(channelId);
  });

  socket.on('channel:leave', (channelId: string) => {
    socket.leave(channelId);
  });

  socket.on('typing:start', (channelId: string) => {
    socket.to(channelId).emit('user:typing', {
      userId: socket.data.userId,
      channelId
    });
  });

  socket.on('typing:stop', (channelId: string) => {
    socket.to(channelId).emit('user:stopped-typing', {
      userId: socket.data.userId,
      channelId
    });
  });
}; 