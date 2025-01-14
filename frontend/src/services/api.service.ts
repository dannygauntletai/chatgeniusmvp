const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let authToken: string | null = null;

const setAuthToken = (token: string | null) => {
  console.log('Setting auth token:', token ? `${token.substring(0, 10)}...` : 'null');
  authToken = token;
};

const getStoredToken = () => {
  const storedToken = authToken || localStorage.getItem('authToken');
  if (!storedToken) {
    console.log('No token found');
    return null;
  }
  
  console.log('Using token:', storedToken.substring(0, 10) + '...');
  return storedToken;
};

const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  console.log(`Making ${options.method || 'GET'} request to ${endpoint}`);
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    console.error(`Request failed: ${response.status} ${response.statusText}`);
    if (response.status === 401) {
      // Clear invalid token
      setAuthToken(null);
      localStorage.removeItem('authToken');
    }
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