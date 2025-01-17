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
        console.error('Token verification failed: Token is invalid');
        return next(new Error('Invalid authentication token'));
      }

      // Check token expiration
      const expiryDate = new Date(clientToken.exp * 1000);
      const now = new Date();
      const timeToExpiry = expiryDate.getTime() - now.getTime();

      if (timeToExpiry <= 0) {
        console.error('Token verification failed: Token has expired', {
          expiry: expiryDate.toISOString(),
          now: now.toISOString()
        });
        return next(new Error('Token has expired'));
      }

      // Set the userId in socket data
      socket.data.userId = clientToken.sub;
      socket.data.tokenExpiry = expiryDate;

      // Set up expiry handler
      const expiryTimeout = setTimeout(() => {
        console.log('Token expired, disconnecting socket');
        socket.emit('auth:token_expired');
        socket.disconnect(true);
      }, timeToExpiry);

      // Clean up timeout on disconnect
      socket.on('disconnect', () => {
        clearTimeout(expiryTimeout);
      });

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      if (error instanceof Error && error.message.includes('expired')) {
        return next(new Error('Token has expired'));
      }
      next(new Error('Invalid authentication token'));
    }
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
}; 