const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let authToken: string | null = null;

const setAuthToken = (token: string | null) => {
  authToken = token;
};

const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = new Error(`HTTP error! status: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  const data = await response.json();
  return data;
};

export const api = {
  get: (endpoint: string) => fetchWithAuth(endpoint),
  post: (endpoint: string, body: any) => fetchWithAuth(endpoint, { 
    method: 'POST', 
    body: JSON.stringify(body) 
  }),
  put: (endpoint: string, body: any) => fetchWithAuth(endpoint, { 
    method: 'PUT', 
    body: JSON.stringify(body) 
  }),
  delete: (endpoint: string) => fetchWithAuth(endpoint, { method: 'DELETE' }),
  setAuthToken
};

export { setAuthToken }; 