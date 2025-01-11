import { User } from '../../users/types/user.types';

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  channelId: string;
  threadId?: string;
  user: {
    id: string;
    username: string;
  };
  reactions: Record<string, Array<{ id: string; username: string }>>;
}

export interface MessageInput {
  content: string;
  channelId?: string;
  threadId?: string;
}