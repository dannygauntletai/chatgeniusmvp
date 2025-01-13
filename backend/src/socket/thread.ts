import { Socket } from 'socket.io';
import { ThreadService } from '../services/thread.service';
import { io } from '../app';

interface ThreadMessageData {
  content: string;
  parentMessageId: string;
  userId: string;
}

export const handleThreadEvents = (socket: Socket) => {
  socket.on('thread:message_create', async (data: ThreadMessageData) => {
    try {
      const message = await ThreadService.createThreadMessage({
        content: data.content,
        parentMessageId: data.parentMessageId,
        userId: data.userId,
      });

      // Emit to everyone in the channel room, including the sender
      io.to(message.channelId).emit('thread:message_created', message);
    } catch (error) {
      console.error('Error creating thread message:', error);
      socket.emit('error', 'Failed to create thread message');
    }
  });
}; 