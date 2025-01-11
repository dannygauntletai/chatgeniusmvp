import { useEffect, useState } from 'react';
import { Channel } from '../../../types/channel.types';
import { ChannelService } from '../../../services/channel.service';
import { socket } from '../../../services/socket.service';
import { CreateChannelModal } from './CreateChannelModal';
import { useChannel } from '../context/ChannelContext';
import { useUser } from '../../../contexts/UserContext';

export const ChannelList = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { activeChannel, setActiveChannel } = useChannel();
  const { user } = useUser();

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const data = await ChannelService.getChannels();
        setChannels(data);
      } catch (err) {
        setError('Failed to load channels');
      } finally {
        setLoading(false);
      }
    };

    loadChannels();

    // Listen for real-time updates
    socket.on('channel:created', (channel: Channel) => {
      setChannels(prev => [...prev, channel]);
    });

    socket.on('channel:member_joined', ({ channelId, user }: { channelId: string; user: { id: string; username: string } }) => {
      setChannels(prev => prev.map(ch => 
        ch.id === channelId 
          ? { ...ch, _count: { members: (ch._count?.members || 0) + 1 }} 
          : ch
      ));
    });

    socket.on('channel:member_left', ({ channelId }: { channelId: string }) => {
      setChannels(prev => prev.map(ch => 
        ch.id === channelId 
          ? { ...ch, _count: { members: (ch._count?.members || 0) - 1 }} 
          : ch
      ));
    });

    return () => {
      socket.off('channel:created');
      socket.off('channel:member_joined');
      socket.off('channel:member_left');
    };
  }, []);

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

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold">Channels</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          disabled={loading}
          className={`text-sm px-2 py-1 bg-primary text-white rounded hover:bg-primary-dark ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Create
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && <div className="p-4 text-red-500">{error}</div>}
        {channels.map(channel => (
          <div 
            key={channel.id}
            className={`p-3 hover:bg-gray-100 cursor-pointer ${
              activeChannel?.id === channel.id ? 'bg-gray-100' : ''
            }`}
          >
            <div 
              className="flex items-center justify-between"
              onClick={() => handleChannelClick(channel)}
            >
              <span className="font-medium"># {channel.name}</span>
              {channel.isPrivate && (
                <span className="text-xs bg-gray-200 px-2 py-1 rounded">Private</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-gray-500">
                {channel._count?.members || 0} members
              </span>
              {channel.members?.some(m => m.id === user.id) && 
               channel.ownerId !== user.id && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await ChannelService.leaveChannel(channel.id);
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Leave
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && channels.length === 0 && (
          <div className="p-4 text-gray-500">Loading channels...</div>
        )}
      </div>
      <CreateChannelModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}; 