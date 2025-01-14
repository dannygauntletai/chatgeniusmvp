import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useUser as useClerkUser, useAuth, useSession } from '@clerk/clerk-react';
import { setAuthToken } from '../services/api.service';

interface UserContextType {
  userId: string;
  token: string | null;
  username: string;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useClerkUser();
  const { getToken } = useAuth();
  const { session } = useSession();

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      console.log('Loaded stored token on mount');
      setAuthToken(storedToken);
    }
  }, []);

  useEffect(() => {
    const updateToken = async () => {
      if (user && session) {
        try {
          console.log('Updating token for user:', user.id);
          // Get a fresh session token that lasts 7 days
          const token = await getToken();
          if (token) {
            console.log('Got new token from Clerk');
            localStorage.setItem('authToken', token);
            setAuthToken(token);
          } else {
            console.warn('No token received from Clerk');
            localStorage.removeItem('authToken');
            setAuthToken(null);
          }
        } catch (error) {
          console.error('Error getting token:', error);
          localStorage.removeItem('authToken');
          setAuthToken(null);
        }
      } else {
        console.log('No user or session, clearing token');
        localStorage.removeItem('authToken');
        setAuthToken(null);
      }
    };

    console.log('Setting up token management');
    updateToken();

    // Refresh token every 6 days to ensure we always have a valid token
    const refreshInterval = setInterval(() => {
      console.log('Token refresh triggered');
      updateToken();
    }, 1000 * 60 * 60 * 24 * 6); // Refresh every 6 days

    return () => {
      console.log('Cleaning up token management');
      clearInterval(refreshInterval);
    };
  }, [user, session, getToken]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const storedToken = localStorage.getItem('authToken');

  return (
    <UserContext.Provider value={{ 
      userId: user?.id || '', 
      token: storedToken,
      username: user?.username || user?.firstName || 'Anonymous'
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