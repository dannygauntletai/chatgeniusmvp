import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { UserService } from '../../../services/user.service';
import { ChannelService } from '../../../services/channel.service';
import { User } from '../types/user.types';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { useUserContext } from '../../../contexts/UserContext';
import { Modal } from '../../shared/components/Modal';

interface UserInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId?: string;
}

export function UserInviteModal({ isOpen, onClose, channelId }: UserInviteModalProps) {
  const { userId } = useAuth();
  const { username: currentUsername } = useUserContext();
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
      const { directMessages } = await ChannelService.getChannels();
      
      if (channelId) {
        const channels = await ChannelService.getChannels();
        const currentChannel = channels.channels.find(c => c.id === channelId);
        if (currentChannel) {
          const filteredUsers = allUsers.filter(u => 
            u.id !== userId && 
            !currentChannel.members.some(m => m.id === u.id)
          );
          setUsers(filteredUsers);
        }
      } else {
        const existingDMUserIds = directMessages.flatMap(dm => 
          dm.members.map(m => m.id)
        ).filter(id => id !== userId);

        const filteredUsers = allUsers.filter(u => 
          u.id !== userId && !existingDMUserIds.includes(u.id)
        );
        setUsers(filteredUsers);
      }
    } catch (error) {
      setError('Failed to load users');
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = async (selectedUser: User) => {
    if (!userId) {
      setError('User not authenticated');
      return;
    }

    try {
      if (channelId) {
        await ChannelService.inviteToChannel(channelId, selectedUser.id);
      } else {
        await ChannelService.createChannel({
          name: `dm-${currentUsername}-${selectedUser.username}`,
          isPrivate: true,
          members: [userId, selectedUser.id]
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

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={channelId ? 'Invite to Channel' : 'New Direct Message'}
    >
      <div className="p-4">
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
    </Modal>
  );
} 