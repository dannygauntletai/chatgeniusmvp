import { SignIn, SignUp, useClerk, useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

console.log('HomePage module loaded');

export const HomePage = () => {
  const clerk = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  console.log('HomePage component rendering');
  console.log('Clerk instance in HomePage:', clerk);
  console.log('Clerk loaded in HomePage:', clerk.loaded);
  console.log('Auth state in HomePage:', { isSignedIn, isLoaded });
  console.log('Current path:', location.pathname);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      console.log('User is signed in, redirecting to dashboard');
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!clerk.loaded) {
    console.log('Clerk not loaded yet in HomePage, showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading authentication...</div>
      </div>
    );
  }

  if (isLoaded && isSignedIn) {
    return null; // Will be redirected by useEffect
  }

  const isSignUp = location.pathname === '/sign-up';
  console.log('Rendering auth component for path:', isSignUp ? 'sign-up' : 'sign-in');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6">Welcome to ChatGenius</h1>
        <div className="bg-white rounded-lg shadow-sm p-6">
          {isSignUp ? (
            <SignUp signInUrl="/sign-in" afterSignUpUrl="/dashboard" />
          ) : (
            <SignIn signUpUrl="/sign-up" afterSignInUrl="/dashboard" />
          )}
        </div>
      </div>
    </div>
  );
}; 