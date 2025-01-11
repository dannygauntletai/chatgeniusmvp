import { Socket } from 'socket.io';

export const handleChannelEvents = (socket: Socket) => {
  socket.on('channel:join', async (channelId: string) => {
    try {
      await socket.join(channelId);
      console.log(`User joined channel: ${channelId}`);
    } catch (error) {
      console.error('Error joining channel:', error);
    }
  });

  socket.on('channel:leave', async (channelId: string) => {
    try {
      await socket.leave(channelId);
      console.log(`User left channel: ${channelId}`);
    } catch (error) {
      console.error('Error leaving channel:', error);
    }
  });
}; 