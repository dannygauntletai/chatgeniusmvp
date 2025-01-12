import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initializeSocket } from './socket/connection';
import { errorHandler } from './middleware/error.middleware';
import { requireAuth } from './middleware/auth.middleware';
import { socketAuth } from './middleware/socket.middleware';
import messageRoutes from './routes/message.routes';
import channelRoutes from './routes/channel.routes';
import threadRoutes from './routes/thread.routes';
import reactionRoutes from './routes/reaction.routes';
import userRoutes from './routes/user.routes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Add socket authentication middleware
io.use(socketAuth);

// Initialize socket connection
initializeSocket(io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check route (unprotected)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Protected routes
app.use('/api/messages', requireAuth, messageRoutes);
app.use('/api/messages', requireAuth, reactionRoutes);
app.use('/api/channels', requireAuth, channelRoutes);
app.use('/api/threads', requireAuth, threadRoutes);
app.use('/api/users', requireAuth, userRoutes);

// Error handling
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, io }; 