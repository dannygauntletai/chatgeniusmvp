import { User } from '../../users/types/user.types';

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  channelId: string;
  threadId?: string;
  user: User;
  _count?: {
    replies: number;
  };
  lastReply?: Message;
}

export interface MessageInput {
  content: string;
  channelId?: string;
  threadId?: string;
}