import { Request } from 'express-serve-static-core';
import { User } from '@clerk/clerk-sdk-node';

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    user: User;
  };
  body: any;
  params: any;
} 