console.log('API URLs:', {
  main: import.meta.env.VITE_API_URL,
  assistant: import.meta.env.VITE_ASSISTANT_API_URL
});

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const ASSISTANT_API_URL = import.meta.env.VITE_ASSISTANT_API_URL || 'http://localhost:8002'; 