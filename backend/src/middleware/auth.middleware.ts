import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth, clerkClient } from '@clerk/clerk-sdk-node';
import { AuthenticatedRequest } from '../types/request.types';
import { prisma } from '../utils/prisma';

// Simple in-memory cache for Clerk user data
interface CacheEntry {
  data: any;
  expiresAt: number;
}

interface DBCacheEntry {
  userId: string;
  lastSyncAt: number;
}

const userCache = new Map<string, CacheEntry>();
const dbSyncCache = new Map<string, DBCacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds
const DB_SYNC_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userCache.entries()) {
    if (value.expiresAt <= now) {
      userCache.delete(key);
    }
  }
  
  for (const [key, value] of dbSyncCache.entries()) {
    if ((now - value.lastSyncAt) > DB_SYNC_TTL) {
      dbSyncCache.delete(key);
    }
  }
}, CACHE_TTL);

const shouldSyncWithDB = (userId: string): boolean => {
  const now = Date.now();
  const lastSync = dbSyncCache.get(userId);
  
  if (!lastSync || (now - lastSync.lastSyncAt) > DB_SYNC_TTL) {
    dbSyncCache.set(userId, { userId, lastSyncAt: now });
    return true;
  }
  
  return false;
};

const getOrFetchClerkUser = async (userId: string) => {
  const now = Date.now();
  const cached = userCache.get(userId);

  // Return cached data if it exists and hasn't expired
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // Fetch fresh data from Clerk
  const clerkUser = await clerkClient.users.getUser(userId);
  
  // Cache the result
  userCache.set(userId, {
    data: clerkUser,
    expiresAt: now + CACHE_TTL
  });

  return clerkUser;
};

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

          const clerkUser = await getOrFetchClerkUser(authReq.auth.userId);
          authReq.auth.user = clerkUser;

          // Only sync with database if needed
          if (shouldSyncWithDB(clerkUser.id)) {
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
          }
          
          next();
          resolve();
        } catch (error: any) {
          console.error('Inner auth error:', error);
          if (error.status === 429) {
            res.status(429).json({ error: 'Too many requests. Please try again later.' });
          } else {
            res.status(401).json({ error: 'Invalid token' });
          }
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}; 