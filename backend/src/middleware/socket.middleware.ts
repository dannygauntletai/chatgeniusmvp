import { Socket } from 'socket.io';
import { clerk } from '../utils/clerk';

export const socketAuth = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token is required'));
    }

    // Get the session token from the Bearer token
    const sessionToken = token.replace('Bearer ', '');
    
    try {
      // Verify the token with Clerk
      const clientToken = await clerk.verifyToken(sessionToken);
      if (!clientToken) {
        return next(new Error('Invalid authentication token'));
      }

      // Set the userId in socket data
      socket.data.userId = clientToken.sub;
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      next(new Error('Invalid authentication token'));
    }
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
}; 