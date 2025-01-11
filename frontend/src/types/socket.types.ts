import { Message } from './message.types';
import { Channel } from './channel.types';

export interface ServerToClientEvents {
  // Message events
  'message:created': (message: Message) => void;
  'message:updated': (message: Message) => void;
  
  // Channel events
  'channel:created': (channel: Channel) => void;
  'channel:member_joined': (data: { 
    channelId: string; 
    user: { 
      id: string; 
      username: string; 
    } 
  }) => void;
  'channel:member_left': (data: { 
    channelId: string; 
    userId: string; 
  }) => void;
  
  // General events
  'error': (error: string) => void;
}

export interface ClientToServerEvents {
  // Message events
  'message:create': {
    content: string;
    channelId: string;
    userId: string;
  };
  
  // Channel events
  'channel:join': (channelId: string) => void;
  'channel:leave': (channelId: string) => void;
} 