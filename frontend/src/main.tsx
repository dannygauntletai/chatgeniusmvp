import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initializeSocket } from './services/socket.service';
import './styles/globals.css';

// Initialize socket connection
initializeSocket();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 