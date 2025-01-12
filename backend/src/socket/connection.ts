import { Server } from 'socket.io';
import { handleMessageEvents } from './message';
import { handleChannelEvents } from './channel';
import { handleThreadEvents } from './thread';
import { handlePresenceEvents } from './presence';

export const initializeSocket = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Ensure we have userId before setting up event handlers
    if (!socket.data.userId) {
      console.error('Socket connection missing userId');
      socket.disconnect();
      return;
    }

    // Initialize message event handlers
    handleMessageEvents(socket);
    // Initialize channel event handlers
    handleChannelEvents(socket);
    // Initialize thread event handlers
    handleThreadEvents(socket);
    // Initialize presence event handlers
    handlePresenceEvents(socket);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}; 