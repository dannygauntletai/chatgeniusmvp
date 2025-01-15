import { useAuth } from '@clerk/clerk-react';

declare global {
  interface Window {
    __clerk__: any;
  }
}

class ApiService {
  private token: string | null = null;
  private baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  setAuthToken(token: string | null) {
    this.token = token;
  }

  private async handleResponse(response: Response): Promise<any> {
    if (response.ok) {
      return response.json();
    }

    if (response.status === 401) {
      // Try to get a new token from Clerk
      try {
        const auth = window.__clerk__;
        if (auth) {
          const token = await auth.session?.getToken();
          if (token) {
            this.setAuthToken(token);
            // Retry the original request with the new token
            const retryResponse = await fetch(response.url, {
              ...response.clone(),
              headers: {
                ...response.headers,
                Authorization: `Bearer ${token}`
              }
            });
            return this.handleResponse(retryResponse);
          }
        }
      } catch (error) {
        console.error('Failed to refresh token:', error);
        // If we can't refresh the token, redirect to login
        window.location.href = '/sign-in';
      }
    }

    throw new Error(`API Error: ${response.status}`);
  }

  private async retryRequest(url: string, options: RequestInit): Promise<Response> {
    return fetch(url, options);
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  async get(endpoint: string) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async post(endpoint: string, data?: any) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse(response);
  }

  async put(endpoint: string, data?: any) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse(response);
  }

  async delete(endpoint: string) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }
}

export const api = new ApiService();

// Export setAuthToken as a standalone function that uses the api instance
export const setAuthToken = (token: string | null) => api.setAuthToken(token); 