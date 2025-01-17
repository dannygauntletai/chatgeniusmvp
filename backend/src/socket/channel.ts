import { Socket } from 'socket.io';

export const handleChannelEvents = (socket: Socket) => {
  socket.on('channel:join', async (channelId: string) => {
    try {
      await socket.join(channelId);
            socket.emit('channel:joined', { channelId });
    } catch (error) {
      console.error('Error joining channel:', error);
      socket.emit('channel:error', { error: 'Failed to join channel' });
    }
  });

  socket.on('channel:leave', async (channelId: string) => {
    try {
      await socket.leave(channelId);
            socket.emit('channel:left', { channelId });
    } catch (error) {
      console.error('Error leaving channel:', error);
      socket.emit('channel:error', { error: 'Failed to leave channel' });
    }
  });
}; 