import { Server } from 'socket.io';
import { handleMessageEvents } from './message';
import { handleChannelEvents } from './channel';
import { handleThreadEvents } from './thread';

export const initializeSocket = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Initialize message event handlers
    handleMessageEvents(socket);
    // Initialize channel event handlers
    handleChannelEvents(socket);
    // Initialize thread event handlers
    handleThreadEvents(socket);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}; 