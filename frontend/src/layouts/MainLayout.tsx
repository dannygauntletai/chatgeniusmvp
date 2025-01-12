import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ChannelList } from '../features/channels/components/ChannelList';
import { DMList } from '../features/direct-messages/components/DMList';
import { UserInviteModal } from '../features/users/components/UserInviteModal';
import { CreateChannelModal } from '../features/channels/components/CreateChannelModal';
import { FileUploadModal } from '../features/files/components/FileUploadModal';
import { FileBrowser } from '../features/files/components/FileBrowser';
import { api } from '../services/api.service';
import { socket, disconnectSocket } from '../services/socket.service';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { signOut } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [isFileUploadModalOpen, setIsFileUploadModalOpen] = useState(false);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      socket.emit('status:update', 'offline');
      await new Promise(resolve => setTimeout(resolve, 100));
      api.setAuthToken(null);
      disconnectSocket();
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 flex flex-col">
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

        {/* Footer with Upload and Sign Out */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setIsFileUploadModalOpen(true)}
              className="flex-1 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Upload
            </button>
            <button
              onClick={() => setIsFileBrowserOpen(!isFileBrowserOpen)}
              className={`flex-1 px-4 py-2 text-sm rounded flex items-center justify-center gap-2 ${
                isFileBrowserOpen 
                  ? 'bg-gray-700 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              Files
            </button>
          </div>
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
        {isFileBrowserOpen && (
          <div className="fixed inset-0 z-[1000] pointer-events-none">
            <div className="absolute inset-0 bg-gray-500 opacity-75 pointer-events-auto" onClick={() => setIsFileBrowserOpen(false)} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-full max-w-4xl max-h-[80vh] bg-gray-800 rounded-lg shadow-xl overflow-hidden pointer-events-auto">
                <FileBrowser />
              </div>
            </div>
          </div>
        )}
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
      <FileUploadModal
        isOpen={isFileUploadModalOpen}
        onClose={() => setIsFileUploadModalOpen(false)}
      />
    </div>
  );
}; 