import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import { initializeSocket } from './services/socket.service';
import './styles/globals.css';

console.log('Starting app initialization...');

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key');
}

console.log('Clerk key available:', !!CLERK_PUBLISHABLE_KEY);

// Initialize socket connection
initializeSocket();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

console.log('Mounting app with Clerk key:', CLERK_PUBLISHABLE_KEY);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={{
        elements: {
          formButtonPrimary: 'bg-blue-500 hover:bg-blue-600',
          card: 'bg-white'
        }
      }}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>
); 