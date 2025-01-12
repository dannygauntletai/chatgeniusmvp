const API_URL = import.meta.env.VITE_API_URL;
console.log('API URL configured as:', API_URL);

let currentToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  console.log('Setting auth token:', token ? 'yes' : 'no');
  if (token) {
    // Log token format for debugging (safely)
    console.log('Token format:', {
      length: token.length,
      prefix: token.substring(0, 10) + '...',
      isJWT: token.split('.').length === 3
    });
  }
  currentToken = token;
};

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const fullUrl = `${API_URL}${endpoint}`;
  console.log('Making request to:', fullUrl);
  console.log('Token available:', currentToken ? 'yes' : 'no');

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (currentToken) {
    defaultHeaders.Authorization = `Bearer ${currentToken}`;
    // Log authorization header format (safely)
    console.log('Authorization header format:', {
      prefix: 'Bearer',
      tokenLength: currentToken.length,
      tokenPrefix: currentToken.substring(0, 10) + '...'
    });
  } else {
    console.warn('No token available for authenticated request to:', fullUrl);
  }

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', {
        url: fullUrl,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        hasToken: !!currentToken
      });

      // Don't redirect on 401, let the auth system handle it
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  } catch (error: unknown) {
    console.error('API request failed:', {
      url: fullUrl,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      hasToken: !!currentToken
    });
    throw error;
  }
}

export const api = {
  get: (endpoint: string) => fetchWithAuth(endpoint),
  
  post: (endpoint: string, data: any) => fetchWithAuth(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  put: (endpoint: string, data: any) => fetchWithAuth(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  delete: (endpoint: string) => fetchWithAuth(endpoint, {
    method: 'DELETE',
  }),
}; 