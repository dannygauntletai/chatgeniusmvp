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
    return api.post('/api/channels', data);
  }

  static async joinChannel(channelId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/join`, {});
    socket.emit('channel:join', channelId);
    this.clearCache(); // Clear cache when channel membership changes
  }

  static async inviteToChannel(channelId: string, userId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/invite`, { userId });
    this.clearCache(); // Clear cache when channel membership changes
  }

  static async leaveChannel(channelId: string): Promise<void> {
    try {
      console.log('Attempting to leave channel:', channelId);
      await api.post(`/api/channels/${channelId}/leave`, {});
      console.log('Successfully left channel:', channelId);
      this.clearCache(); // Clear cache when channel membership changes
    } catch (error) {
      console.error('Failed to leave channel:', error);
      // Ignore 400 errors as they might indicate user is not in channel
      if (error instanceof Error && !error.message.includes('status: 400')) {
        throw error;
      }
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