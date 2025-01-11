import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initializeSocket } from './socket/connection';
import { errorHandler } from './middleware/error.middleware';
import messageRoutes from './routes/message.routes';
import channelRoutes from './routes/channel.routes';
import threadRoutes from './routes/thread.routes';
import reactionRoutes from './routes/reaction.routes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Initialize socket connection
initializeSocket(io);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/messages', messageRoutes);
app.use('/api/messages', reactionRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/threads', threadRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, io }; 