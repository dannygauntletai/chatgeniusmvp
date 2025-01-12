import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    user: {
      id: string;
      username: string;
      email?: string;
    };
  };
  body: {
    name?: string;
    isPrivate?: boolean;
    members?: string[];
    content?: string;
    emoji?: string;
    messageId?: string;
    channelId?: string;
    threadId?: string;
    [key: string]: any;
  };
  params: {
    channelId?: string;
    messageId?: string;
    threadId?: string;
    userId?: string;
    [key: string]: any;
  };
} 