import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth, clerkClient } from '@clerk/clerk-sdk-node';
import { AuthenticatedRequest } from '../types/request.types';
import { prisma } from '../utils/prisma';

export { AuthenticatedRequest };

export const requireAuth = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    await new Promise<void>((resolve) => {
      ClerkExpressRequireAuth()(req, res, async () => {
        try {
          const authReq = req as AuthenticatedRequest;
          if (!authReq.auth?.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            resolve();
            return;
          }

          const clerkUser = await clerkClient.users.getUser(authReq.auth.userId);
          authReq.auth.user = clerkUser;

          // Sync user with our database
          try {
            const user = await prisma.user.upsert({
              where: { id: clerkUser.id },
              update: {
                username: clerkUser.username || `user_${clerkUser.id.substring(0, 8)}`,
                email: clerkUser.emailAddresses[0]?.emailAddress,
                status: 'online'
              },
              create: {
                id: clerkUser.id,
                username: clerkUser.username || `user_${clerkUser.id.substring(0, 8)}`,
                email: clerkUser.emailAddresses[0]?.emailAddress,
                status: 'online'
              }
            });

            console.log('User synced with database:', user.id);
          } catch (dbError) {
            console.error('Error syncing user with database:', dbError);
            // Continue even if sync fails - don't block the request
          }
          
          next();
          resolve();
        } catch (error) {
          console.error('Inner auth error:', error);
          res.status(401).json({ error: 'Invalid token' });
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}; 