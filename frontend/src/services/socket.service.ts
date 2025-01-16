import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';
const MAX_RECONNECTION_ATTEMPTS = 5;
const INITIAL_RECONNECTION_DELAY = 1000;
const MAX_RECONNECTION_DELAY = 30000;

let reconnectionAttempts = 0;
let reconnectionDelay = INITIAL_RECONNECTION_DELAY;
let messageBuffer: Array<{event: string; data: any}> = [];
let isConnected = false;

// Create socket instance without connecting
let authData = { token: '' };

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: authData,
  reconnection: true,
  reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
  reconnectionDelay: INITIAL_RECONNECTION_DELAY,
  reconnectionDelayMax: MAX_RECONNECTION_DELAY,
  timeout: 10000,
  transports: ['websocket', 'polling']
});

const flushMessageBuffer = () => {
  while (messageBuffer.length > 0 && isConnected) {
    const message = messageBuffer.shift();
    if (message) {
      socket.emit(message.event, message.data);
    }
  }
};

export const initializeSocket = () => {
  socket.on('connect', () => {
    console.log('Connected to socket server');
    isConnected = true;
    reconnectionAttempts = 0;
    reconnectionDelay = INITIAL_RECONNECTION_DELAY;
    flushMessageBuffer();
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
    isConnected = false;
  });

  socket.on('connect_error', (error: Error) => {
    console.error('Socket connection error:', error);
    isConnected = false;
    
    if (reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
      reconnectionAttempts++;
      reconnectionDelay = Math.min(reconnectionDelay * 2, MAX_RECONNECTION_DELAY);
      
      setTimeout(() => {
        console.log(`Attempting reconnection ${reconnectionAttempts}/${MAX_RECONNECTION_ATTEMPTS}`);
        socket.connect();
      }, reconnectionDelay);
    }
  });

  socket.on('error', (error: Error) => {
    console.error('Socket error:', error);
  });
};

// Enhanced emit function with buffering
export const safeEmit = (event: string, data: any) => {
  if (!isConnected) {
    messageBuffer.push({ event, data });
    return;
  }
  socket.emit(event, data);
};

export const connectSocket = (sessionId: string, sessionToken: string) => {
  if (socket.connected) {
    socket.disconnect();
  }

  // Update auth data with Bearer token
  authData.token = `Bearer ${sessionToken}`;
  
  // Reset connection state
  reconnectionAttempts = 0;
  reconnectionDelay = INITIAL_RECONNECTION_DELAY;
  messageBuffer = [];
  
  // Reconnect with new auth data
  socket.connect();
  
  // Emit online status
  socket.emit('status:update', 'online');
};

export const disconnectSocket = () => {
  // Emit offline status before disconnecting
  if (socket.connected) {
    socket.emit('status:update', 'offline');
    socket.disconnect();
  }
  
  // Clear state
  authData.token = '';
  messageBuffer = [];
  isConnected = false;
}; 