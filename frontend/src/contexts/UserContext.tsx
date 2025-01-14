import { createContext, useContext, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useUser as useClerkUser, useAuth, useSession } from '@clerk/clerk-react';
import { setAuthToken } from '../services/api.service';

interface UserContextType {
  userId: string;
  token: string | null;
  username: string;
  refreshToken: () => Promise<string | null>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useClerkUser();
  const { getToken } = useAuth();
  const { session } = useSession();
  const lastTokenRef = useRef<string | null>(null);

  const updateToken = useCallback(async (force: boolean = false) => {
    if (!user || !session) {
      console.log('No user or session, clearing token');
      localStorage.removeItem('authToken');
      setAuthToken(null);
      lastTokenRef.current = null;
      return null;
    }

    try {
      // Only update if forced or token has changed
      const currentToken = localStorage.getItem('authToken');
      if (!force && currentToken && currentToken === lastTokenRef.current) {
        console.log('Token is still valid, skipping update');
        return currentToken;
      }

      console.log('Updating token for user:', user.id);
      const token = await getToken();
      if (token && token !== lastTokenRef.current) {
        console.log('Got new token from Clerk');
        localStorage.setItem('authToken', token);
        setAuthToken(token);
        lastTokenRef.current = token;
        return token;
      } else if (!token) {
        console.warn('No token received from Clerk');
        localStorage.removeItem('authToken');
        setAuthToken(null);
        lastTokenRef.current = null;
      }
    } catch (error) {
      console.error('Error getting token:', error);
      localStorage.removeItem('authToken');
      setAuthToken(null);
      lastTokenRef.current = null;
    }
    return null;
  }, [user, session, getToken]);

  // Initial token setup
  useEffect(() => {
    if (isLoaded) {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        console.log('Loaded stored token on mount');
        setAuthToken(storedToken);
        lastTokenRef.current = storedToken;
        // Verify the stored token
        updateToken(true);
      } else {
        // No stored token, get a fresh one
        updateToken(true);
      }
    }
  }, [isLoaded, updateToken]);

  // Set up periodic refresh
  useEffect(() => {
    if (!isLoaded) return;

    console.log('Setting up token refresh interval');
    const refreshInterval = setInterval(() => {
      console.log('Token refresh interval triggered');
      updateToken(true);
    }, 1000 * 60 * 60); // Refresh every hour

    return () => {
      console.log('Cleaning up token refresh interval');
      clearInterval(refreshInterval);
    };
  }, [isLoaded, updateToken]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ 
      userId: user?.id || '', 
      token: lastTokenRef.current,
      username: user?.username || user?.firstName || 'Anonymous',
      refreshToken: () => updateToken(true)
    }}>
      {children}
    </UserContext.Provider>
  );
};

// Main hook for accessing user context
export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

// Alias for backward compatibility
export const useUserContext = useUser; 