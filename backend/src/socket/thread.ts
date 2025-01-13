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

      // Emit to sender first for immediate feedback
      socket.emit('thread:message_created', message);
      // Then emit to others in the channel
      socket.to(message.channelId).emit('thread:message_created', message);
    } catch (error) {
      console.error('Error creating thread message:', error);
      socket.emit('error', 'Failed to create thread message');
    }
  });
}; 