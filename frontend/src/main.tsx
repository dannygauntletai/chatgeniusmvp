import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

declare global {
  interface Window {
    __CLERK_KEY__: string;
    __API_URL__: string;
    __WS_URL__: string;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

console.log('Initializing Clerk...', {
  key: window.__CLERK_KEY__?.substring(0, 10) + '...',
  apiUrl: window.__API_URL__,
});

if (!window.__CLERK_KEY__) {
  console.error('Clerk key is missing!');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={window.__CLERK_KEY__}
      appearance={{
        baseTheme: undefined,
        variables: { colorPrimary: '#000000' },
        layout: { socialButtonsPlacement: 'bottom' }
      }}
      navigate={(to) => window.location.href = to}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>,
); 