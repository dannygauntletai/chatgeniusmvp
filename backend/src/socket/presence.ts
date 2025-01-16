import { Socket } from 'socket.io';
import { UserService } from '../services/user.service';

export const handlePresenceEvents = (socket: Socket) => {
  const userId = socket.data.userId;

  // Set user as online when they connect
  const setUserOnline = async () => {
    try {
      // Don't update assistant's status
      if (userId === process.env.ASSISTANT_BOT_USER_ID) return;
      
      const user = await UserService.updateUserStatus(userId, 'online');
      socket.broadcast.emit('user:status_changed', { 
        userId, 
        status: 'online',
        user_status: user.user_status 
      });
    } catch (error) {
      console.error('Error setting user online:', error);
    }
  };

  // Set user as offline when they disconnect
  const setUserOffline = async () => {
    try {
      // Don't update assistant's status
      if (userId === process.env.ASSISTANT_BOT_USER_ID) return;
      
      const user = await UserService.updateUserStatus(userId, 'offline');
      socket.broadcast.emit('user:status_changed', { 
        userId, 
        status: 'offline',
        user_status: user.user_status 
      });
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
      // Don't update assistant's status
      if (userId === process.env.ASSISTANT_BOT_USER_ID) return;
      
      const user = await UserService.updateUserStatus(userId, status);
      socket.broadcast.emit('user:status_changed', { 
        userId, 
        status,
        user_status: user.user_status 
      });
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  });
}; 