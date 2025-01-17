import { SignedIn, SignedOut, useClerk, useAuth, useSession } from '@clerk/clerk-react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './features/home/components/HomePage';
import { UserProvider } from './contexts/UserContext';
import { ChannelProvider } from './features/channels/context/ChannelContext';
import { ErrorBoundary } from './features/shared/components/ErrorBoundary';
import { MessageList } from './features/messages/components/MessageList';
import { MessageInput } from './features/messages/components/MessageInput';
import { useEffect, useState } from 'react';
import { setAuthToken } from './services/api.service';
import { socket, connectSocket, disconnectSocket } from './services/socket.service';
import { LoadingSpinner } from './features/shared/components/LoadingSpinner';

console.log('App component rendering');

const LoggedHomePage = () => {
  console.log('Rendering HomePage within SignedOut');
  return <HomePage />;
};

const DashboardLayout = () => {
  const { session } = useSession();
  const [isTokenSet, setIsTokenSet] = useState(false);
  let refreshTimeout: NodeJS.Timeout | undefined;
  let isMounted = true;

  useEffect(() => {
    const setupAuth = async () => {
      if (!isMounted || !session) return;

      try {
        const sessionToken = await session.getToken();
        if (!sessionToken) {
          console.error('Failed to get session token');
          if (isMounted) {
            setIsTokenSet(false);
            setAuthToken(null);
            disconnectSocket();
          }
          return;
        }

        // Set the token first
        setAuthToken(sessionToken);
        
        // Wait a tick to ensure token is propagated
        await new Promise(resolve => setTimeout(resolve, 0));
        
        if (isMounted) {
          // Get token expiry time
          const expiryTime = session.expireAt;
          const expiry = expiryTime ? new Date(expiryTime).getTime() : Date.now() + 3600000;

          // Connect socket with auth credentials and expiry time
          await connectSocket(session.id, sessionToken, expiry);
          
          // Set user as online only during initial connection
          socket.emit('status:update', 'online');
          
          // Only set isTokenSet to true after everything is ready
          setIsTokenSet(true);

          // Schedule next refresh for 5 minutes before token expiry
          if (expiryTime) {
            const now = new Date();
            const expiry = new Date(expiryTime);
            const timeToExpiry = expiry.getTime() - now.getTime();
            const refreshTime = Math.max(timeToExpiry - 5 * 60 * 1000, 60 * 1000); // At least 1 minute before expiry
            refreshTimeout = setTimeout(setupAuth, refreshTime);
          }
        }
      } catch (error) {
        console.error('Error in auth setup:', error);
        if (isMounted) {
          setIsTokenSet(false);
          setAuthToken(null);
          disconnectSocket();
        }
      }
    };

    // Listen for token expiry events from socket
    socket.on('auth:token_expired', () => {
      console.log('Token expired event received, refreshing auth...');
      setupAuth();
    });

    setupAuth();

    return () => {
      isMounted = false;
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      socket.off('auth:token_expired');
      // Only disconnect socket, don't update status
      disconnectSocket();
    };
  }, [session]);

  if (!session || !isTokenSet) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
        <div className="text-gray-400 ml-3">Setting up authentication...</div>
      </div>
    );
  }

  return (
    <UserProvider>
      <SignedIn>
        <ChannelProvider>
          <MainLayout>
            <div className="flex-1 flex flex-col">
              <MessageList />
            </div>
          </MainLayout>
        </ChannelProvider>
      </SignedIn>
    </UserProvider>
  );
};

const AppRoutes = () => {
  const clerk = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  if (!clerk.loaded || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner className="h-8 w-8" />
          <div className="text-gray-400">Loading ChatGenius...</div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          isSignedIn ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <SignedOut>
              <LoggedHomePage />
            </SignedOut>
          )
        }
      />
      <Route
        path="/sign-in"
        element={
          isSignedIn ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoggedHomePage />
          )
        }
      />
      <Route
        path="/sign-up"
        element={
          isSignedIn ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoggedHomePage />
          )
        }
      />
      <Route
        path="/dashboard/*"
        element={
          isSignedIn ? (
            <DashboardLayout />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
};

export const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}; 