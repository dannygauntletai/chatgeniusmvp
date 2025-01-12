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

console.log('App component rendering');

const LoggedHomePage = () => {
  console.log('Rendering HomePage within SignedOut');
  return <HomePage />;
};

const DashboardLayout = () => {
  const { session } = useSession();
  const [isTokenSet, setIsTokenSet] = useState(false);
  console.log('Dashboard session:', session?.id);

  useEffect(() => {
    let isMounted = true;
    let refreshTimeout: NodeJS.Timeout;

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

        if (isMounted) {
          setAuthToken(sessionToken);
          setIsTokenSet(true);

          // Connect socket with auth credentials
          connectSocket(session.id, sessionToken);
          // Set user as online only during initial connection
          socket.emit('status:update', 'online');

          // Schedule next refresh for 5 minutes before token expiry
          const expiryTime = session.expireAt;
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

    setupAuth();

    return () => {
      isMounted = false;
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      // Only disconnect socket, don't update status
      disconnectSocket();
    };
  }, [session]);

  if (!session || !isTokenSet) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Setting up authentication...</div>
      </div>
    );
  }

  return (
    <SignedIn>
      <UserProvider>
        <ChannelProvider>
          <MainLayout>
            <div className="flex-1 flex flex-col">
              <MessageList />
              <MessageInput />
            </div>
          </MainLayout>
        </ChannelProvider>
      </UserProvider>
    </SignedIn>
  );
};

const AppRoutes = () => {
  const clerk = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  if (!clerk.loaded || !isLoaded) {
    return <div>Loading app...</div>;
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