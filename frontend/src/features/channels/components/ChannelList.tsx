import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Channel } from '../../../types/channel.types';
import { ChannelService } from '../../../services/channel.service';
import { socket } from '../../../services/socket.service';
import { CreateChannelModal } from './CreateChannelModal';
import { useChannel } from '../context/ChannelContext';
import { useUserContext } from '../../../contexts/UserContext';
import { LeaveChannelModal } from './LeaveChannelModal';
import { DeleteChannelModal } from './DeleteChannelModal';

interface ChannelListProps {
  onCreateChannel: () => void;
}

export const ChannelList = ({ onCreateChannel }: ChannelListProps) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [channelToLeave, setChannelToLeave] = useState<Channel | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const { userId } = useAuth();
  const { activeChannel, setActiveChannel } = useChannel();

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const data = await ChannelService.getChannels();
        setChannels(data.channels);
      } catch (err) {
        setError('Failed to load channels');
      } finally {
        setLoading(false);
      }
    };

    loadChannels();

    // Listen for real-time updates
    socket.on('channel:created', (channel: Channel) => {
      if (!channel.name.startsWith('dm-')) {
        setChannels(prev => [...prev, channel]);
      }
    });

    // Listen for channel membership events
    socket.on('channel:member_left', ({ channelId, userId: leftUserId, memberCount }: { 
      channelId: string; 
      userId: string; 
      memberCount: number;
    }) => {
      setChannels(prevChannels => {
        // If the user who left is the current user, remove the channel
        if (leftUserId === userId) {
          const newChannels = prevChannels.filter(c => c.id !== channelId);
          if (activeChannel?.id === channelId) {
            setActiveChannel(null);
          }
          return newChannels;
        }
        
        // Otherwise, just update the member count
        return prevChannels.map(channel => {
          if (channel.id === channelId) {
            return {
              ...channel,
              _count: { ...channel._count, members: memberCount }
            };
          }
          return channel;
        });
      });
    });

    socket.on('channel:member_joined', ({ channelId, user, memberCount }: {
      channelId: string;
      user: { id: string; username: string };
      memberCount: number;
    }) => {
      setChannels(prevChannels => 
        prevChannels.map(channel => {
          if (channel.id === channelId) {
            return {
              ...channel,
              members: [...(channel.members || []), user],
              _count: { ...channel._count, members: memberCount }
            };
          }
          return channel;
        })
      );
    });

    // Add listener for channel deletion
    socket.on('channel:deleted', ({ channelId, memberIds }: { 
      channelId: string; 
      memberIds: string[];
    }) => {
      // Only update if the current user was a member and userId is defined
      if (userId && memberIds.includes(userId)) {
        setChannels(prevChannels => prevChannels.filter(c => c.id !== channelId));
        if (activeChannel?.id === channelId) {
          setActiveChannel(null);
        }
      }
    });

    return () => {
      socket.off('channel:created');
      socket.off('channel:member_left');
      socket.off('channel:member_joined');
      socket.off('channel:deleted');
    };
  }, [userId, activeChannel, setActiveChannel]);

  const handleChannelClick = (channel: Channel) => {
    try {
      if (activeChannel?.id === channel.id) {
        return;
      }

      // Update UI immediately
      setActiveChannel(channel);
      console.log('Active channel updated to:', channel);

      // Handle socket events in background
      if (activeChannel) {
        socket.emit('channel:leave', activeChannel.id);
      }

      socket.emit('channel:join', channel.id);

    } catch (error) {
      console.error('Failed to switch channel:', error);
    }
  };

  const handleLeaveClick = (channel: Channel, event: React.MouseEvent) => {
    event.stopPropagation();
    setChannelToLeave(channel);
    setLeaveModalOpen(true);
  };

  const handleLeaveComplete = () => {
    if (channelToLeave) {
      setChannels(channels.filter(c => c.id !== channelToLeave.id));
      if (activeChannel?.id === channelToLeave.id) {
        setActiveChannel(null);
      }
    }
  };

  const handleDeleteClick = (channel: Channel, event: React.MouseEvent) => {
    event.stopPropagation();
    setChannelToDelete(channel);
    setDeleteModalOpen(true);
  };

  const handleDeleteComplete = () => {
    if (channelToDelete) {
      setChannels(channels.filter(c => c.id !== channelToDelete.id));
      if (activeChannel?.id === channelToDelete.id) {
        setActiveChannel(null);
      }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {error && <div className="p-4 text-red-500">{error}</div>}
      {channels.map(channel => (
        <div 
          key={channel.id}
          onClick={() => handleChannelClick(channel)}
          className={`style="margin-bottom: 0.75rem;" p-3 cursor-pointer rounded-md ${
            activeChannel?.id === channel.id
              ? 'bg-gray-700'
              : 'hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${
              activeChannel?.id === channel.id ? 'text-white' : 'text-white'
            }`}>
              # {channel.name}
            </span>
            {channel.isPrivate && (
              <span className="text-xs bg-gray-600 px-2 py-1 rounded text-white">Private</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">
              {channel._count?.members || 0} members
            </span>
            <div className="flex gap-2">
              {channel.members?.some(m => m.id === userId) && 
               channel.ownerId !== userId && (
                <button
                  onClick={(e) => handleLeaveClick(channel, e)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Leave
                </button>
              )}
              {channel.ownerId === userId && (
                <button
                  onClick={(e) => handleDeleteClick(channel, e)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {loading && channels.length === 0 && (
        <div className="p-4 text-gray-400">Fetching channels...</div>
      )}
      {channelToLeave && (
        <LeaveChannelModal
          isOpen={leaveModalOpen}
          onClose={() => {
            setLeaveModalOpen(false);
            setChannelToLeave(null);
          }}
          channelId={channelToLeave.id}
          channelName={channelToLeave.name}
          onLeave={handleLeaveComplete}
        />
      )}
      {channelToDelete && (
        <DeleteChannelModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setChannelToDelete(null);
          }}
          channelId={channelToDelete.id}
          channelName={channelToDelete.name}
          onDelete={handleDeleteComplete}
        />
      )}
    </div>
  );
}; 