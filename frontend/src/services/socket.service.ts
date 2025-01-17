import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';
const MAX_RECONNECTION_ATTEMPTS = 5;
const INITIAL_RECONNECTION_DELAY = 1000;
const MAX_RECONNECTION_DELAY = 30000;
const TOKEN_EXPIRY_BUFFER = 60000; // 1 minute buffer before token expiry

let reconnectionAttempts = 0;
let reconnectionDelay = INITIAL_RECONNECTION_DELAY;
let messageBuffer: Array<{event: string; data: any}> = [];
let isConnected = false;
let tokenRefreshTimer: NodeJS.Timeout | null = null;

// Create socket instance without connecting
let authData = { 
  token: '',
  expiresAt: 0 // Track token expiration
};

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: authData,
  reconnection: true,
  reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
  reconnectionDelay: INITIAL_RECONNECTION_DELAY,
  reconnectionDelayMax: MAX_RECONNECTION_DELAY,
  timeout: 10000,
  transports: ['polling', 'websocket'] // Try polling first, then upgrade to websocket
});

const flushMessageBuffer = () => {
  while (messageBuffer.length > 0 && isConnected) {
    const message = messageBuffer.shift();
    if (message) {
      socket.emit(message.event, message.data);
    }
  }
};

const clearTokenRefreshTimer = () => {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
};

const handleTokenExpiry = () => {
    if (socket.connected) {
    socket.disconnect();
  }
  isConnected = false;
  // Emit an event that the app can listen to for handling token refresh
  socket.emit('auth:token_expired');
};

const setupTokenExpiryCheck = () => {
  clearTokenRefreshTimer();
  
  if (authData.expiresAt) {
    const timeUntilExpiry = authData.expiresAt - Date.now() - TOKEN_EXPIRY_BUFFER;
    if (timeUntilExpiry > 0) {
      tokenRefreshTimer = setTimeout(handleTokenExpiry, timeUntilExpiry);
    } else {
      handleTokenExpiry();
    }
  }
};

export const initializeSocket = () => {
  socket.on('connect', () => {
        isConnected = true;
    reconnectionAttempts = 0;
    reconnectionDelay = INITIAL_RECONNECTION_DELAY;
    flushMessageBuffer();
  });

  socket.on('disconnect', (reason: 'io server disconnect' | 'io client disconnect' | 'ping timeout' | 'transport close' | 'transport error') => {
        isConnected = false;
    
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, check token before reconnecting
      if (Date.now() < authData.expiresAt - TOKEN_EXPIRY_BUFFER) {
                socket.connect();
      } else {
                handleTokenExpiry();
      }
    }
  });

  socket.on('connect_error', (error: Error) => {
    console.error('Socket connection error:', error);
    isConnected = false;
    
    // Check if error is related to authentication
    if (error.message.includes('authentication') || error.message.includes('token')) {
            handleTokenExpiry();
      return;
    }
    
    if (reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
      reconnectionAttempts++;
      reconnectionDelay = Math.min(reconnectionDelay * 2, MAX_RECONNECTION_DELAY);
      
      setTimeout(() => {
        // Only attempt reconnection if token is still valid
        if (Date.now() < authData.expiresAt - TOKEN_EXPIRY_BUFFER) {
                    socket.connect();
        } else {
                    handleTokenExpiry();
        }
      }, reconnectionDelay);
    }
  });

  socket.on('error', (error: Error) => {
    console.error('Socket error:', error);
  });
};

export const safeEmit = (event: string, data: any) => {
  if (!isConnected) {
    messageBuffer.push({ event, data });
    return;
  }
  socket.emit(event, data);
};

export const connectSocket = (sessionId: string, sessionToken: string, tokenExpiresAt?: number) => {
  if (socket.connected) {
    socket.disconnect();
  }

  // Update auth data with Bearer token and expiry
  authData.token = `Bearer ${sessionToken}`;
  authData.expiresAt = tokenExpiresAt || Date.now() + 3600000; // Default to 1 hour if not provided
  
  // Reset connection state
  reconnectionAttempts = 0;
  reconnectionDelay = INITIAL_RECONNECTION_DELAY;
  messageBuffer = [];
  
  // Setup token expiry check
  setupTokenExpiryCheck();
  
  // Only connect if token is not expired
  if (Date.now() < authData.expiresAt - TOKEN_EXPIRY_BUFFER) {
    socket.connect();
  } else {
        handleTokenExpiry();
  }
};

export const disconnectSocket = () => {
  clearTokenRefreshTimer();
  
  if (socket.connected) {
    socket.emit('status:update', 'offline');
    socket.disconnect();
  }
  
  // Clear state
  authData.token = '';
  authData.expiresAt = 0;
  messageBuffer = [];
  isConnected = false;
}; 