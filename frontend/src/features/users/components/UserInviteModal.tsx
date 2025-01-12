import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { UserService } from '../../../services/user.service';
import { ChannelService } from '../../../services/channel.service';
import { User } from '../types/user.types';
import { LoadingSpinner } from '../../../components/LoadingSpinner';

interface UserInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId?: string;
}

export function UserInviteModal({ isOpen, onClose, channelId }: UserInviteModalProps) {
  const { userId } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const allUsers = await UserService.getUsers();
      // Filter out current user and users who already have DM channels
      const filteredUsers = allUsers.filter((u: User) => u.id !== userId);
      setUsers(filteredUsers);
    } catch (error) {
      setError('Failed to load users');
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = async (selectedUser: User) => {
    try {
      if (channelId) {
        // Invite user to existing channel
        await ChannelService.inviteToChannel(channelId, selectedUser.id);
      } else {
        // Create DM channel
        await ChannelService.createChannel({
          name: `${selectedUser.username}`,
          isPrivate: true,
          members: [selectedUser.id]
        });
      }
      onClose();
    } catch (error) {
      setError('Failed to invite user');
      console.error('Error inviting user:', error);
    }
  };

  const filteredUsers = users.filter(user => 
    user.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50"></div>
      <div className="relative bg-gray-1100 rounded-xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">
            {channelId ? 'Invite to Channel' : 'New Direct Message'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 mb-4 bg-gray-900 text-white rounded border border-gray-700 focus:outline-none focus:border-blue-500"
        />

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center py-4">{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-gray-400 text-center py-4">No users found</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {filteredUsers.map(user => (
              <button
                key={user.id}
                onClick={() => handleUserClick(user)}
                className="w-full flex items-center px-4 py-3 hover:bg-gray-900 rounded transition-colors"
              >
                <div className="w-10 h-10 rounded-full mr-3 bg-gray-700 flex items-center justify-center text-white">
                  {user.username[0].toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-white">{user.username}</div>
                  <div className="text-sm text-gray-400">{user.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 