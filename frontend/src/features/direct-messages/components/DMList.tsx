import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { socket } from '../../../services/socket.service';
import { ChannelService } from '../../../services/channel.service';
import { useChannel } from '../../channels/context/ChannelContext';
import { Channel } from '../../../types/channel.types';

interface ChannelMember {
  id: string;
  username: string;
  user_status: string;
}

export const DMList = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const auth = useAuth();
  const { activeChannel, setActiveChannel } = useChannel();
  const userId = auth.userId;

  const loadChannels = useCallback(async (pageNum: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const response = await ChannelService.getChannels(pageNum);
      const newChannels = response.directMessages;
      
      setChannels(prev => pageNum === 1 ? newChannels : [...prev, ...newChannels]);
      setHasMore(newChannels.length === response.pagination.limit);
      setError(null);
    } catch (error) {
      setError('Failed to load channels');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !loadingRef.current) {
      setPage(prev => prev + 1);
    }
  }, [hasMore]);

  useEffect(() => {
    if (userId && page) {
      loadChannels(page);
    }
  }, [userId, page, loadChannels]);

  useEffect(() => {
    if (!userId) return;

    // Listen for new DM channels
    socket.on('channel:created', (channel: Channel) => {
      if (channel.name.startsWith('dm-') && channel.members.some(m => m.id === userId)) {
        setChannels(prev => [channel, ...prev]);
      }
    });

    // Listen for channel updates
    socket.on('channel:updated', (updatedChannel: Channel) => {
      if (updatedChannel.name.startsWith('dm-')) {
        setChannels(prev => 
          prev.map(ch => ch.id === updatedChannel.id ? updatedChannel : ch)
        );
      }
    });

    // Listen for member left events
    socket.on('channel:member_left', ({ channelId, userId: leftUserId }: { channelId: string; userId: string }) => {
      if (leftUserId === userId) {
        setChannels(prev => prev.filter(ch => ch.id !== channelId));
        if (activeChannel?.id === channelId) {
          setActiveChannel(null);
        }
      }
    });

    return () => {
      socket.off('channel:created');
      socket.off('channel:updated');
      socket.off('channel:member_left');
    };
  }, [userId, activeChannel, setActiveChannel]);

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

  if (loading && page === 1) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 text-gray-400">Fetching messages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-full overflow-y-auto"
      onScroll={handleScroll}
    >
      <div className="space-y-1">
        {channels.map(dm => {
          const otherMember = dm.members.find(member => member.id !== userId);
          if (!otherMember) return null;

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
                    otherMember.user_status === 'online' ? 'bg-green-500' : 'bg-red-500'
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
        {loading && page > 1 && (
          <div className="p-4 text-center text-gray-400">
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}; 