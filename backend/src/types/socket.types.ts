import { Message } from './message.types';
import { Channel } from './channel.types';

export interface ServerToClientEvents {
  'message:created': (message: Message) => void;
  'message:updated': (message: Message) => void;
  'channel:created': (channel: Channel) => void;
  'channel:member_joined': (data: { channelId: string; user: { id: string; username: string } }) => void;
  'channel:member_left': (data: { channelId: string; userId: string }) => void;
  'thread:message_created': (message: Message) => void;
  'thread:message_updated': (message: Message) => void;
  'error': (error: string) => void;
}

export interface ClientToServerEvents {
  'message:create': {
    content: string;
    channelId: string;
    userId: string;
  };
  'thread:message_create': {
    content: string;
    parentMessageId: string;
    userId: string;
  };
  'channel:join': (channelId: string) => void;
  'channel:leave': (channelId: string) => void;
}

export interface SocketData {
  userId: string;
} 