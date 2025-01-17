import { Channel, ChannelCreateInput } from '../types/channel.types';
import { socket } from './socket.service';
import { api } from './api.service';

interface ChannelResponse {
  channels: Channel[];
  directMessages: Channel[];
  pagination: {
    page: number;
    limit: number;
  };
}

interface ChannelJoinedEvent {
  channelId: string;
}

interface ChannelLeftEvent {
  channelId: string;
}

interface ChannelErrorEvent {
  error: string;
}

// Cache configuration
const CACHE_DURATION = 30000; // 30 seconds
let channelCache: {
  data: ChannelResponse | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0
};

export class ChannelService {
  static async getChannels(page = 1, limit = 50): Promise<ChannelResponse> {
    const now = Date.now();
    
    // Return cached data if it's still fresh
    if (channelCache.data && (now - channelCache.timestamp) < CACHE_DURATION) {
      return channelCache.data;
    }

    console.log('Fetching channels...');
    const response = await api.get(`/api/channels?page=${page}&limit=${limit}`);

    // Update cache
    channelCache = {
      data: response,
      timestamp: now
    };

    return response;
  }

  static clearCache() {
    channelCache = {
      data: null,
      timestamp: 0
    };
  }

  static async createChannel(data: ChannelCreateInput): Promise<Channel> {
    const channel = await api.post('/api/channels', data);
    
    // Update cache with new channel if we have cached data
    if (channelCache.data) {
      channelCache = {
        data: {
          ...channelCache.data,
          channels: [channel, ...channelCache.data.channels]
        },
        timestamp: Date.now()
      };
    } else {
      this.clearCache(); // If no cache, clear it to force a fresh fetch
    }
    
    return channel;
  }

  static async joinChannel(channelId: string): Promise<void> {
    try {
      // First, join the channel in the database
      await api.post(`/api/channels/${channelId}/join`, {});
      
      // Create a promise that resolves when the socket join is acknowledged
      const joinPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('channel:joined');
          socket.off('channel:error');
          reject(new Error('Channel join timeout'));
        }, 5000);

        // Listen for join acknowledgment
        socket.once('channel:joined', ({ channelId: joinedId }: ChannelJoinedEvent) => {
          if (joinedId === channelId) {
            clearTimeout(timeout);
            resolve();
          }
        });

        // Listen for errors
        socket.once('channel:error', ({ error }: ChannelErrorEvent) => {
          clearTimeout(timeout);
          reject(new Error(error));
        });

        // Emit join event
        socket.emit('channel:join', channelId);
      });

      // Wait for socket join to complete
      await joinPromise;
      
      // Clear cache when channel membership changes
      this.clearCache();
    } catch (error: any) {
      // If we're already a member, just join the socket room
      if (error.message?.includes('status: 400')) {
        // Still need to wait for socket join
        const joinPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off('channel:joined');
            socket.off('channel:error');
            reject(new Error('Channel join timeout'));
          }, 5000);

          socket.once('channel:joined', ({ channelId: joinedId }: ChannelJoinedEvent) => {
            if (joinedId === channelId) {
              clearTimeout(timeout);
              resolve();
            }
          });

          socket.once('channel:error', ({ error }: ChannelErrorEvent) => {
            clearTimeout(timeout);
            reject(new Error(error));
          });

          socket.emit('channel:join', channelId);
        });

        await joinPromise;
        return;
      }
      throw error;
    }
  }

  static async inviteToChannel(channelId: string, userId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/invite`, { userId });
    this.clearCache(); // Clear cache when channel membership changes
  }

  static async leaveChannel(channelId: string): Promise<void> {
    try {
      // Create a promise that resolves when the socket leave is acknowledged
      const leavePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('channel:left');
          socket.off('channel:error');
          reject(new Error('Channel leave timeout'));
        }, 5000);

        socket.once('channel:left', ({ channelId: leftId }: ChannelLeftEvent) => {
          if (leftId === channelId) {
            clearTimeout(timeout);
            resolve();
          }
        });

        socket.once('channel:error', ({ error }: ChannelErrorEvent) => {
          clearTimeout(timeout);
          reject(new Error(error));
        });

        socket.emit('channel:leave', channelId);
      });

      await leavePromise;
      this.clearCache();
    } catch (error) {
      console.error('Error leaving channel:', error);
      throw error;
    }
  }

  static async removeMember(channelId: string, userId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/remove-member`, { userId });
    this.clearCache(); // Clear cache when channel membership changes
  }

  static async deleteChannel(channelId: string): Promise<void> {
    try {
      await api.delete(`/api/channels/${channelId}`);
      this.clearCache(); // Clear cache after channel deletion
    } catch (error) {
      console.error('Failed to delete channel:', error);
      throw error;
    }
  }
} 