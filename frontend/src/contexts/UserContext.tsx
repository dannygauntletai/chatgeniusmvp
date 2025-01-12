import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useUser as useClerkUser, useAuth, useSession } from '@clerk/clerk-react';

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

  useEffect(() => {
    const updateToken = async () => {
      if (user && session) {
        try {
          // Get a fresh session token
          const token = await getToken();
          if (token) {
            // Store the session token
            localStorage.setItem('authToken', `${session.id}__${token}`);
          }
        } catch (error) {
          console.error('Error getting token:', error);
          // Clear invalid token
          localStorage.removeItem('authToken');
        }
      } else {
        // Clear token if no user or session
        localStorage.removeItem('authToken');
      }
    };

    updateToken();

    // Set up token refresh
    const refreshInterval = setInterval(updateToken, 1000 * 60 * 29); // Refresh every 29 minutes

    return () => clearInterval(refreshInterval);
  }, [user, session, getToken]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user?.id) {
    return null;
  }

  return (
    <UserContext.Provider value={{ 
      userId: user.id, 
      token: localStorage.getItem('authToken'),
      username: user.username || user.firstName || 'Anonymous'
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
};

// Re-export Clerk's useUser hook
export const useUser = useClerkUser; 