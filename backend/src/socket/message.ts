import { Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

interface MessageData {
  content: string;
  userId: string;
  channelId: string;
}

export const handleMessageEvents = (socket: Socket) => {
  socket.on('message:create', async (data: MessageData) => {
    console.log('Received message data:', data);
    try {
      const message = await prisma.message.create({
        data: {
          content: data.content,
          userId: data.userId,
          channelId: data.channelId,
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
      console.log('Created message:', message);
      socket.emit('message:created', message);
      socket.to(data.channelId).emit('message:created', message);
    } catch (error) {
      console.error('Error creating message:', error);
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