import { Server } from 'socket.io';
import { handleMessageEvents } from './message';
import { handleChannelEvents } from './channel';
import { handleThreadEvents } from './thread';
import { handlePresenceEvents } from './presence';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiter configuration
const rateLimiter = new RateLimiterMemory({
  points: 50,  // Number of points
  duration: 1, // Per second
});

// Message batching configuration
const MESSAGE_BATCH_SIZE = 10;
const MESSAGE_BATCH_INTERVAL = 100; // ms

interface MessageBatch {
  channelId: string;
  messages: any[];
  timer?: NodeJS.Timeout;
}

const messageBatches = new Map<string, MessageBatch>();

const processBatch = (channelId: string, io: Server) => {
  const batch = messageBatches.get(channelId);
  if (batch && batch.messages.length > 0) {
    io.to(channelId).emit('messages:batch', batch.messages);
    batch.messages = [];
    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = undefined;
    }
  }
};

export const initializeSocket = (io: Server) => {
  io.on('connection', async (socket) => {
    
    // Ensure we have userId before setting up event handlers
    if (!socket.data.userId) {
      console.error('Socket connection missing userId');
      socket.disconnect();
      return;
    }

    try {
      // Apply rate limiting
      await rateLimiter.consume(socket.data.userId);
    } catch (error) {
      console.error('Rate limit exceeded for user:', socket.data.userId);
      socket.emit('error', { message: 'Too many requests. Please try again later.' });
      return;
    }

    // Enhanced message handling with batching
    socket.on('message:create', async (data: any) => {
      try {
        await rateLimiter.consume(socket.data.userId);
        
        let batch = messageBatches.get(data.channelId);
        if (!batch) {
          batch = {
            channelId: data.channelId,
            messages: []
          };
          messageBatches.set(data.channelId, batch);
        }

        batch.messages.push(data);

        if (batch.messages.length >= MESSAGE_BATCH_SIZE) {
          processBatch(data.channelId, io);
        } else if (!batch.timer) {
          batch.timer = setTimeout(() => {
            processBatch(data.channelId, io);
          }, MESSAGE_BATCH_INTERVAL);
        }
      } catch (rejRes) {
        if (rejRes instanceof Error && rejRes.name === 'RateLimiterError') {
          socket.emit('error', { message: 'Message rate limit exceeded' });
        } else {
          console.error('Error processing message:', rejRes);
          socket.emit('error', { message: 'Failed to process message' });
        }
      }
    });

    // Initialize event handlers with error boundaries
    try {
      handleMessageEvents(socket);
      handleChannelEvents(socket);
      handleThreadEvents(socket);
      handlePresenceEvents(socket);
    } catch (error) {
      console.error('Error initializing event handlers:', error);
      socket.emit('error', { message: 'Failed to initialize socket connection' });
    }

    socket.on('disconnect', () => {
            // Clean up any pending message batches
      messageBatches.forEach((batch, channelId) => {
        if (batch.timer) {
          clearTimeout(batch.timer);
        }
        if (batch.messages.length > 0) {
          processBatch(channelId, io);
        }
      });
    });
  });
}; 