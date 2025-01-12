import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Modal } from '../../shared/components/Modal';
import { Channel } from '../../../types/channel.types';
import { ChannelService } from '../../../services/channel.service';
import { useChannel } from '../context/ChannelContext';
import { socket } from '../../../services/socket.service';

interface ChannelMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
}

export function ChannelMembersModal({ isOpen, onClose, channel }: ChannelMembersModalProps) {
  const { userId } = useAuth();
  const { setActiveChannel } = useChannel();
  const [searchTerm, setSearchTerm] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; username: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Refresh channel data when modal is opened
      const refreshChannel = async () => {
        try {
          const { channels } = await ChannelService.getChannels();
          const updatedChannel = channels.find(c => c.id === channel.id);
          if (updatedChannel) {
            setActiveChannel(updatedChannel);
          }
        } catch (error) {
          console.error('Failed to refresh channel data:', error);
        }
      };
      refreshChannel();
    }
  }, [isOpen, channel.id, setActiveChannel]);

  useEffect(() => {
    // Listen for member removal events
    socket.on('channel:member_left', ({ channelId, userId: removedUserId }: { channelId: string; userId: string }) => {
      if (channelId === channel.id) {
        // Update the channel members list
        const updatedMembers = channel.members.filter(m => m.id !== removedUserId);
        setActiveChannel({
          ...channel,
          members: updatedMembers,
          _count: { members: (channel._count?.members || 0) - 1 }
        });
      }
    });

    // Listen for member join events
    socket.on('channel:member_joined', ({ channelId, user }: { channelId: string; user: { id: string; username: string } }) => {
      if (channelId === channel.id) {
        // Update the channel members list
        const updatedMembers = [...channel.members, user];
        setActiveChannel({
          ...channel,
          members: updatedMembers,
          _count: { members: (channel._count?.members || 0) + 1 }
        });
      }
    });

    return () => {
      socket.off('channel:member_left');
      socket.off('channel:member_joined');
    };
  }, [channel, setActiveChannel]);

  const filteredMembers = channel.members.filter(member => 
    member.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    
    try {
      await ChannelService.removeMember(channel.id, memberToRemove.id);
      // Update the channel members list
      const updatedMembers = channel.members.filter(m => m.id !== memberToRemove.id);
      setActiveChannel({
        ...channel,
        members: updatedMembers,
        _count: { members: (channel._count?.members || 0) - 1 }
      });
      setMemberToRemove(null);
      setError(null);
    } catch (error) {
      setError('Failed to remove member');
      console.error('Error removing member:', error);
    }
  };

  const handleClose = () => {
    setMemberToRemove(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const isOwner = userId === channel.ownerId;

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title={`Members in #${channel.name}`}>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded border border-gray-700 focus:outline-none focus:border-blue-500"
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm mb-4 text-center">{error}</div>
        )}

        {filteredMembers.length === 0 ? (
          <div className="text-gray-400 text-center py-4">No members found</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {filteredMembers.map(member => (
              <div
                key={member.id}
                className="flex items-center px-4 py-3 hover:bg-gray-900 rounded transition-colors"
              >
                <div className="w-10 h-10 rounded-full mr-3 bg-gray-700 flex items-center justify-center text-white">
                  {member.username[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {member.username}
                    {member.id === channel.ownerId && (
                      <span className="ml-2 text-xs bg-blue-500 px-2 py-0.5 rounded">Owner</span>
                    )}
                  </div>
                </div>
                {isOwner && member.id !== userId && (
                  <button
                    onClick={() => setMemberToRemove(member)}
                    className="text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Confirmation Modal */}
      {memberToRemove && (
        <Modal 
          isOpen={true} 
          onClose={() => setMemberToRemove(null)}
          title="Remove Member"
        >
          <div className="p-4">
            <p className="text-gray-300 mb-6">
              Are you sure you want to remove <span className="text-white font-medium">{memberToRemove.username}</span> from <span className="text-white font-medium">#{channel.name}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMemberToRemove(null)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveMember}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Remove Member
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
} 