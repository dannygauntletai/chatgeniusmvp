import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';

// Create socket instance without connecting
let authData = { token: '' };

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: authData
});

export const initializeSocket = () => {
  socket.on('connect', () => {
    console.log('Connected to socket server');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
  });

  socket.on('connect_error', (error: Error) => {
    console.error('Socket connection error:', error);
  });

  socket.on('error', (error: Error) => {
    console.error('Socket error:', error);
  });
};

export const connectSocket = (sessionId: string, sessionToken: string) => {
  if (socket.connected) {
    socket.disconnect();
  }

  // Update auth data with Bearer token
  authData.token = `Bearer ${sessionToken}`;
  
  // Reconnect with new auth data
  socket.connect();
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
  
  // Clear auth data
  authData.token = '';
}; 