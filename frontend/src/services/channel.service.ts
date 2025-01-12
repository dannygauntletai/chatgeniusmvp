import { Channel, ChannelCreateInput } from '../types/channel.types';
import { socket } from './socket.service';
import { api } from './api.service';

export class ChannelService {
  static async getChannels(): Promise<Channel[]> {
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
} 