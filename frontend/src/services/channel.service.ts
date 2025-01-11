import { Channel, ChannelCreateInput } from '../types/channel.types';
import { socket } from './socket.service';

export class ChannelService {
  static async getChannels(): Promise<Channel[]> {
    const response = await fetch('/api/channels');
    if (!response.ok) {
      throw new Error('Failed to fetch channels');
    }
    return response.json();
  }

  static async createChannel(data: ChannelCreateInput): Promise<Channel> {
    const response = await fetch('/api/channels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to create channel');
    }
    return response.json();
  }

  static async joinChannel(channelId: string): Promise<void> {
    const response = await fetch(`/api/channels/${channelId}/join`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to join channel');
    }
    socket.emit('channel:join', channelId);
  }

  static async leaveChannel(channelId: string): Promise<void> {
    const response = await fetch(`/api/channels/${channelId}/leave`, {
      method: 'POST',
    });
    
    if (!response.ok && response.status !== 400) {
      throw new Error('Failed to leave channel');
    }
  }
} 