import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ChannelList } from '../features/channels/components/ChannelList';
import { DMList } from '../features/direct-messages/components/DMList';
import { UserInviteModal } from '../features/users/components/UserInviteModal';
import { CreateChannelModal } from '../features/channels/components/CreateChannelModal';
import { api } from '../services/api.service';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { signOut } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);

  const handleSignOut = async () => {
    // Clear API token
    localStorage.removeItem('authToken');
    api.setAuthToken(null);
    await signOut();
  };

  return (
    <div className="flex h-screen bg-gray-800 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">Chat Genius</h1>
        </div>

        {/* Channels Section */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6">
            <div className="flex items-center justify-between text-gray-400 text-sm font-medium mb-2">
              <h2>CHANNELS</h2>
              <button
                onClick={() => setIsCreateChannelModalOpen(true)}
                className="hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <ChannelList onCreateChannel={() => setIsCreateChannelModalOpen(true)} />
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="flex items-center justify-between text-gray-400 text-sm font-medium mb-2">
              <h2>DIRECT MESSAGES</h2>
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <DMList />
          </div>
        </div>

        {/* Footer with Sign Out */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>

      {/* Modals */}
      <UserInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
      <CreateChannelModal
        isOpen={isCreateChannelModalOpen}
        onClose={() => setIsCreateChannelModalOpen(false)}
      />
    </div>
  );
}; 