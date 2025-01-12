import { useState, useEffect } from 'react';
import { User } from '../types/user.types';
import { UserService } from '../../../services/user.service';
import { ChannelService } from '../../../services/channel.service';
import { LoadingSpinner } from '../../../features/shared/components/LoadingSpinner';
import { Modal } from '../../../features/shared/components/Modal';
import { useUserContext } from '../../../contexts/UserContext';

interface UserInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserInviteModal = ({ isOpen, onClose }: UserInviteModalProps) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { userId } = useUserContext();

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true);
        const [usersResponse, channelsResponse] = await Promise.all([
          UserService.getUsers(),
          ChannelService.getChannels()
        ]);

        // Get existing DM user IDs
        const existingDMUserIds = channelsResponse.directMessages
          .flatMap(dm => dm.members)
          .filter(member => member.id !== userId)
          .map(member => member.id);

        console.log('Filtering users:', {
          currentUserId: userId,
          existingDMUserIds,
          totalUsers: usersResponse.length,
          filteredUsers: usersResponse.filter(user => 
            user.id !== userId && !existingDMUserIds.includes(user.id)
          ).length
        });

        // Filter out current user and users who already have DM channels
        const filteredUsers = usersResponse.filter(user => 
          user.id !== userId && !existingDMUserIds.includes(user.id)
        );

        setUsers(filteredUsers);
        setError(null);
      } catch (err) {
        setError('Failed to load users');
        console.error('Error loading users:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadUsers();
    }
  }, [isOpen, userId]);

  const handleUserClick = async (user: User) => {
    try {
      // Create a private channel for DM with both users
      await ChannelService.createChannel({
        name: `dm-${user.username}`,
        isPrivate: true,
        members: [userId, user.id]
      });
      onClose();
    } catch (err) {
      console.error('Error creating DM channel:', err);
      setError('Failed to start direct message');
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Direct Messages">
      <div className="flex flex-col h-full">
        <div className="p-4">
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search for users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner className="h-8 w-8" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-4 px-3 bg-red-500/10 text-red-400 rounded-lg">
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-white">
              <svg className="h-12 w-12 mb-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <div>No users found</div>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleUserClick(user)}
                  className="w-full flex items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white group"
                >
                  <div className="flex-1 flex items-center">
                    <div className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-medium mr-3 text-white">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <span>{user.username}</span>
                  </div>
                  <svg 
                    className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}; 