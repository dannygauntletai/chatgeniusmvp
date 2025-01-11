import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';

export const configureSocket = (httpServer: HttpServer) => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      methods: ['GET', 'POST']
    }
  });

  return io;
}; 