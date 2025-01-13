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
      
      // Emit the original message immediately
      socket.to(message.channelId).emit('message:created', message);
      socket.emit('message:created', message);
      
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
        
        if (!channel) return;

        try {
          // Get assistant response
          const assistantResponse = await assistantService.getAssistantResponse(
            message,
            channel,
            socket.data.userId
          );

          // Create assistant's response message
          const botMessage = await messageService.create({
            content: assistantResponse,
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID!, // Bot user ID from env
            threadId: message.threadId || undefined // Maintain thread context if it exists
          });

          // Stop typing indicator
          socket.to(message.channelId).emit('user:typing', {
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID,
            typing: false
          });

          // Emit the bot's message to all users in the channel
          socket.to(message.channelId).emit('message:created', botMessage);
          socket.emit('message:created', botMessage);
        } catch (error) {
          // If assistant fails, send an error message
          const errorMessage = await messageService.create({
            content: "I apologize, but I'm having trouble processing your request at the moment. Please try again later.",
            channelId: message.channelId,
            userId: process.env.ASSISTANT_BOT_USER_ID!,
            threadId: message.threadId || ""
          });

          socket.to(message.channelId).emit('message:created', errorMessage);
          socket.emit('message:created', errorMessage);
        }
      }
    } catch (error) {
      console.error('Message handling error:', error);
      socket.emit('message:error', { error: 'Failed to process message' });
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