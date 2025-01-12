import { useState, useEffect } from 'react';
import { Channel } from '../../../types/channel.types';
import { useChannel } from '../../channels/context/ChannelContext';
import { useUserContext } from '../../../contexts/UserContext';
import { socket } from '../../../services/socket.service';
import { ChannelService } from '../../../services/channel.service';

interface ChannelMemberUpdate {
  channelId: string;
  user: {
    id: string;
    username: string;
  };
}

interface UserStatuses {
  [userId: string]: string;
}

export const DMList = () => {
  const [dms, setDms] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStatuses, setUserStatuses] = useState<UserStatuses>({});
  const { activeChannel, setActiveChannel } = useChannel();
  const { userId } = useUserContext();

  useEffect(() => {
    const loadDMs = async () => {
      try {
        setLoading(true);
        const data = await ChannelService.getChannels();
        console.log('Loaded DMs:', data.directMessages);
        setDms(data.directMessages);

        // Initialize user statuses
        const initialStatuses: UserStatuses = {};
        data.directMessages.forEach(dm => {
          const otherMember = dm.members.find(member => member.id !== userId);
          if (otherMember) {
            initialStatuses[otherMember.id] = otherMember.status || 'offline';
          }
        });
        setUserStatuses(initialStatuses);
        setError(null);
      } catch (err) {
        setError('Failed to load direct messages');
        console.error('Error loading DMs:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDMs();

    // Listen for new DM channels
    const handleNewChannel = (channel: Channel) => {
      if (channel.name.startsWith('dm-') && channel.members.some(member => member.id === userId)) {
        setDms(prevDms => [...prevDms, channel]);
      }
    };

    // Listen for user status changes
    const handleStatusChange = ({ userId, status }: { userId: string; status: string }) => {
      setUserStatuses(prev => ({
        ...prev,
        [userId]: status
      }));
    };

    socket.on('channel:created', handleNewChannel);
    socket.on('user:status_changed', handleStatusChange);

    return () => {
      socket.off('channel:created', handleNewChannel);
      socket.off('user:status_changed', handleStatusChange);
    };
  }, [userId]);

  const handleDMClick = (dm: Channel) => {
    if (activeChannel?.id === dm.id) return;
    
    // Leave current channel if exists
    if (activeChannel) {
      socket.emit('channel:leave', activeChannel.id);
    }

    // Join new channel
    setActiveChannel(dm);
    socket.emit('channel:join', dm.id);
  };

  if (loading) return (
    <div className="flex flex-col h-full">
      <div className="p-4 text-gray-400">Fetching messages...</div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col h-full">
      <div className="p-4 text-red-500">{error}</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="space-y-1">
        {dms.map(dm => {
          const otherMember = dm.members.find(member => member.id !== userId);
          if (!otherMember) {
            console.log('No other member found in channel:', dm.id);
            return null;
          }

          const status = userStatuses[otherMember.id] || 'offline';

          return (
            <div
              key={dm.id}
              onClick={() => handleDMClick(dm)}
              className={`p-3 cursor-pointer rounded-md ${
                activeChannel?.id === dm.id
                  ? 'bg-gray-700'
                  : 'hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <div 
                  className={`w-2 h-2 rounded-full ${
                    status === 'online' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className={`text-sm font-medium ${
                  activeChannel?.id === dm.id ? 'text-white' : 'text-white'
                }`}>
                  {otherMember.username}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}; 