import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { socket } from '../../../services/socket.service';
import { ChannelService } from '../../../services/channel.service';
import { useChannel } from '../../channels/context/ChannelContext';
import { Channel } from '../../../types/channel.types';

interface ChannelMember {
  id: string;
  username: string;
  status?: string;
}

export const DMList = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStatuses, setUserStatuses] = useState<Record<string, string>>({});
  const auth = useAuth();
  const { activeChannel, setActiveChannel } = useChannel();
  const userId = auth.userId;

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const response = await ChannelService.getChannels();
        setChannels(response.directMessages);

        // Initialize user statuses
        const initialStatuses: Record<string, string> = {};
        response.directMessages.forEach((channel: Channel) => {
          const otherMember = channel.members.find((member: ChannelMember) => member.id !== userId) as ChannelMember;
          if (otherMember) {
            initialStatuses[otherMember.id] = otherMember.status || 'offline';
          }
        });
        setUserStatuses(initialStatuses);
      } catch (error) {
        setError('Failed to load channels');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadChannels();
    }
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
        {channels.map(dm => {
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