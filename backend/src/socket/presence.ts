import { Socket } from 'socket.io';
import { UserService } from '../services/user.service';

export const handlePresenceEvents = (socket: Socket) => {
  const userId = socket.data.userId;

  // Set user as online when they connect
  const setUserOnline = async () => {
    try {
      await UserService.updateUserStatus(userId, 'online');
      socket.broadcast.emit('user:status_changed', { userId, status: 'online' });
    } catch (error) {
      console.error('Error setting user online:', error);
    }
  };

  // Set user as offline when they disconnect
  const setUserOffline = async () => {
    try {
      await UserService.updateUserStatus(userId, 'offline');
      socket.broadcast.emit('user:status_changed', { userId, status: 'offline' });
    } catch (error) {
      console.error('Error setting user offline:', error);
    }
  };

  // Set initial online status
  setUserOnline();

  // Handle disconnection
  socket.on('disconnect', setUserOffline);

  // Handle custom status updates
  socket.on('status:update', async (status: string) => {
    try {
      await UserService.updateUserStatus(userId, status);
      socket.broadcast.emit('user:status_changed', { userId, status });
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  });
}; 