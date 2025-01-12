import io, { Socket } from 'socket.io-client';
import { Message } from '../types/message.types';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';

export const socket = io(SOCKET_URL);

export const initializeSocket = () => {
  socket.on('connect', () => {
    console.log('Connected to socket server');
    socket.on('message:created', (message: Message) => {
      console.log('Received message:', message);
    });
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

  return () => {
    socket.disconnect();
  };
}; 