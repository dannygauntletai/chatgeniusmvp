const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let authToken: string | null = null;
let isRefreshing = false;
let failedRequests: Array<(value?: unknown) => void> = [];

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

const fetchWithAuth = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  let token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  console.log(`Making ${options.method || 'GET'} request to ${endpoint}`);
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      console.error(`Request failed: ${response.status} ${response.statusText}`);
      
      // If it's a 401 and we have a token, try to refresh
      if (response.status === 401 && token) {
        // If already refreshing, wait for it to complete
        if (isRefreshing) {
          return new Promise<T>(resolve => {
            failedRequests.push(resolve);
          }).then(() => fetchWithAuth(endpoint, options));
        }

        isRefreshing = true;
        
        try {
          // Try to get a new token from localStorage (might have been refreshed by UserContext)
          const newToken = localStorage.getItem('authToken');
          if (newToken && newToken !== token) {
            console.log('Found newer token in localStorage, retrying request');
            setAuthToken(newToken);
            isRefreshing = false;
            failedRequests.forEach(callback => callback());
            failedRequests = [];
            return fetchWithAuth(endpoint, options);
          }
        } catch (error) {
          console.error('Error during token refresh:', error);
        } finally {
          isRefreshing = false;
          failedRequests.forEach(callback => callback());
          failedRequests = [];
        }
      }
      
      const error = new Error(`HTTP error! status: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    if ((error as any).status === 401) {
      setAuthToken(null);
      localStorage.removeItem('authToken');
    }
    throw error;
  }
};

export const api = {
  get: <T>(endpoint: string) => fetchWithAuth<T>(endpoint),
  post: <T>(endpoint: string, body: any) => fetchWithAuth<T>(endpoint, { 
    method: 'POST', 
    body: JSON.stringify(body) 
  }),
  put: <T>(endpoint: string, body: any) => fetchWithAuth<T>(endpoint, { 
    method: 'PUT', 
    body: JSON.stringify(body) 
  }),
  delete: <T>(endpoint: string) => fetchWithAuth<T>(endpoint, { method: 'DELETE' }),
  setAuthToken
};

export { setAuthToken }; 