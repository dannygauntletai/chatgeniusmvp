import { Message } from '../../messages/types/message.types';

export interface Thread {
  parentMessage: Message;
  replies: Message[];
  replyCount: number;
  lastReply?: Message;
}

export interface ThreadMessageInput {
  content: string;
  parentMessageId: string;
}

export interface ThreadState {
  activeThread?: Thread;
  isLoading: boolean;
  error?: string;
} 