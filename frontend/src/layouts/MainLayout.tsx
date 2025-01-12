import { ReactNode } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { ChannelList } from '../features/channels/components/ChannelList';
import { setAuthToken } from '../services/api.service';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    try {
      // Clear our API token first
      setAuthToken(null);
      // Then sign out from Clerk
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="h-screen flex">
      <aside className="w-64 border-r bg-white flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h1 className="text-lg font-bold">ChatGenius</h1>
          <button
            onClick={handleSignOut}
            className="text-sm px-2 py-1 text-red-600 hover:text-red-800"
          >
            Sign Out
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ChannelList />
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}; 