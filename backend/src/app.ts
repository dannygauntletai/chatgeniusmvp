import express, { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
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
import fileRoutes from './routes/file.routes';

const app = express();
const httpServer = createServer(app);

// Configure allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://chatgenius.fyi',
  'https://chatgeniusmvp.onrender.com',
  'https://chatgeniusmvp-vector.onrender.com',
  'https://chatgeniusmvp-document.onrender.com',
  'https://chatgeniusmvp-phone.onrender.com',
  'https://chatgeniusmvp-backend.onrender.com',
  process.env.FRONTEND_URL
].filter((origin): origin is string => Boolean(origin));

console.log('Allowed origins:', allowedOrigins);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  }
});

// Add socket authentication middleware
io.use(socketAuth);

// Initialize socket connection
initializeSocket(io);

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
  preflightContinue: false
}));

// Add error handling for CORS preflight
app.options('*', cors());

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
app.use('/api/files', requireAuth, fileRoutes);

// Error handling middleware
const errorHandlerMiddleware: ErrorRequestHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  errorHandler(err, req, res, next);
};

// Error handling
app.use(errorHandlerMiddleware);

// Server configuration
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, io }; 