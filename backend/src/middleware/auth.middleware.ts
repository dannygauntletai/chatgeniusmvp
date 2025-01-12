import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth, clerkClient } from '@clerk/clerk-sdk-node';
import { AuthenticatedRequest } from '../types/request.types';

export { AuthenticatedRequest };

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    return await new Promise((resolve) => {
      ClerkExpressRequireAuth()(req, res, async () => {
        try {
          const authReq = req as AuthenticatedRequest;
          if (!authReq.auth?.userId) {
            resolve(res.status(401).json({ error: 'Unauthorized' }));
            return;
          }

          const user = await clerkClient.users.getUser(authReq.auth.userId);
          authReq.auth.user = user;
          
          next();
          resolve();
          return;
        } catch (error) {
          console.error('Inner auth error:', error);
          resolve(res.status(401).json({ error: 'Invalid token' }));
          return;
        }
      });
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}; 