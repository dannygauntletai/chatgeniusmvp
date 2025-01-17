import { createContext, useContext, ReactNode, useEffect, useCallback, useRef, useState } from 'react';
import { useUser as useClerkUser, useAuth, useSession } from '@clerk/clerk-react';
import { setAuthToken } from '../services/api.service';

interface UserContextType {
  userId: string | null;
  token: string | null;
  username: string | null;
  refreshToken: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, user } = useClerkUser();
  const { session } = useSession();
  const lastTokenRef = useRef<string | null>(null);
  const [userState, setUserState] = useState<any | null>(null);
  const [sessionState, setSessionState] = useState<any | null>(null);

  const updateToken = useCallback(async (force: boolean = false) => {
    if (!isLoaded) return;

    try {
      if (!isSignedIn || !session) {
        setAuthToken(null);
        localStorage.removeItem('authToken');
        return;
      }

      const token = await session.getToken();
      if (force || !lastTokenRef.current || token !== lastTokenRef.current) {
                setAuthToken(token);
        if (token) {
          localStorage.setItem('authToken', token);
        }
        lastTokenRef.current = token;
      }
    } catch (error) {
      console.error('Error getting token:', error);
      setAuthToken(null);
      localStorage.removeItem('authToken');
    }
  }, [isLoaded, isSignedIn, session]);

  useEffect(() => {
    const div = document.createElement('div');
    div.dataset.userContext = 'true';
    document.body.appendChild(div);

    const handleRefreshToken = () => {
            updateToken(true);
    };

    div.addEventListener('refresh-token', handleRefreshToken);

    return () => {
      div.removeEventListener('refresh-token', handleRefreshToken);
      document.body.removeChild(div);
    };
  }, [updateToken]);

  const value = {
    userId: user?.id ?? null,
    token: lastTokenRef.current,
    username: user?.username ?? null,
    refreshToken: async () => {
      await updateToken(true);
    }
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

// Alias for backward compatibility
export const useUserContext = useUser; 