import { Request } from 'express';

declare namespace Express {
  interface Request {
    user: {
      id: string;
    }
  }
} 