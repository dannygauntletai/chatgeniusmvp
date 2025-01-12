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

export const DMList = () => {
  const [dms, setDms] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeChannel, setActiveChannel } = useChannel();
  const { userId } = useUserContext();

  useEffect(() => {
    const loadDMs = async () => {
      try {
        setLoading(true);
        const data = await ChannelService.getChannels();
        setDms(data.directMessages);
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

    socket.on('channel:created', handleNewChannel);

    return () => {
      socket.off('channel:created', handleNewChannel);
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
          const username = dm.name.replace('dm-', '');
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
              <span className={`text-sm font-medium ${
                activeChannel?.id === dm.id ? 'text-white' : 'text-white'
              }`}>
                {username}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}; 