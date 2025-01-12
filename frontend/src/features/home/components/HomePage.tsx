import { SignIn, SignUp, useClerk, useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';

export const HomePage = () => {
  const clerk = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!clerk.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner className="h-8 w-8" />
          <div className="text-gray-400">Loading authentication...</div>
        </div>
      </div>
    );
  }

  if (isLoaded && isSignedIn) {
    return null;
  }

  const isSignUp = location.pathname === '/sign-up';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4 py-12">
      <div className="w-[400px]">
        {isSignUp ? (
          <SignUp 
            signInUrl="/sign-in" 
            afterSignUpUrl="/dashboard"
            appearance={{
              elements: {
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
                card: 'bg-gray-800 border border-gray-700 shadow-xl rounded-xl',
                headerTitle: 'text-white',
                headerSubtitle: 'text-gray-400',
                socialButtonsBlockButton: 'border-gray-700 bg-gray-900 hover:bg-gray-800 text-white',
                dividerLine: 'bg-gray-700',
                dividerText: 'text-gray-500',
                formFieldLabel: 'text-gray-400',
                formFieldInput: 'bg-gray-900 border-gray-700 text-white',
                footerActionLink: 'text-blue-400 hover:text-blue-300',
              }
            }}
          />
        ) : (
          <SignIn 
            signUpUrl="/sign-up" 
            afterSignInUrl="/dashboard"
            appearance={{
              elements: {
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
                card: 'bg-gray-800 border border-gray-700 shadow-xl rounded-xl',
                headerTitle: 'text-white',
                headerSubtitle: 'text-gray-400',
                socialButtonsBlockButton: 'border-gray-700 bg-gray-900 hover:bg-gray-800 text-white',
                dividerLine: 'bg-gray-700',
                dividerText: 'text-gray-500',
                formFieldLabel: 'text-gray-400',
                formFieldInput: 'bg-gray-900 border-gray-700 text-white',
                footerActionLink: 'text-blue-400 hover:text-blue-300',
              }
            }}
          />
        )}
      </div>
    </div>
  );
}; 