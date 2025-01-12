import { Channel, ChannelCreateInput } from '../types/channel.types';
import { socket } from './socket.service';
import { api } from './api.service';

interface ChannelResponse {
  channels: Channel[];
  directMessages: Channel[];
}

export class ChannelService {
  static async getChannels(): Promise<ChannelResponse> {
    console.log('Fetching channels...');
    return api.get('/api/channels');
  }

  static async createChannel(data: ChannelCreateInput): Promise<Channel> {
    return api.post('/api/channels', data);
  }

  static async joinChannel(channelId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/join`, {});
    socket.emit('channel:join', channelId);
  }

  static async inviteToChannel(channelId: string, userId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/invite`, { userId });
  }

  static async leaveChannel(channelId: string): Promise<void> {
    try {
      await api.post(`/api/channels/${channelId}/leave`, {});
    } catch (error) {
      // Ignore 400 errors as they might indicate user is not in channel
      if (error instanceof Error && !error.message.includes('status: 400')) {
        throw error;
      }
    }
  }

  static async removeMember(channelId: string, userId: string): Promise<void> {
    await api.post(`/api/channels/${channelId}/remove-member`, { userId });
  }
} 