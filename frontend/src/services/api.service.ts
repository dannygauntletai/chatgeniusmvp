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
          const session = await auth.session;
          if (session) {
            const token = await session.getToken();
            if (token) {
              this.setAuthToken(token);
              
              // Get the request method from the request object
              const requestMethod = response.type === 'cors' ? 'GET' : 'POST';
              
              // Get the original request options
              const options: RequestInit = {
                method: requestMethod,
                headers: {
                  ...this.getHeaders(),
                  Authorization: `Bearer ${token}`
                }
              };
              
              // If it's not a GET request and has a body
              if (requestMethod !== 'GET' && response.body) {
                const body = await response.clone().text();
                if (body) {
                  options.body = body;
                }
              }
              
              // Retry the request with the new token
              const retryResponse = await fetch(response.url, options);
              return this.handleResponse(retryResponse);
            }
          }
        }
        // If we couldn't get a new token, redirect to login
        window.location.href = '/sign-in';
      } catch (error) {
        console.error('Failed to refresh token:', error);
        window.location.href = '/sign-in';
      }
    }

    throw new Error(`API Error: ${response.status}`);
  }

  private async retryRequest(url: string, options: RequestInit): Promise<Response> {
    return fetch(url, options);
  }

  private getHeaders(isFormData: boolean = false): HeadersInit {
    const headers: HeadersInit = {};

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

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

  async post(endpoint: string, data?: any, isFormData: boolean = false) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(isFormData),
      body: isFormData ? data : JSON.stringify(data),
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