import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import { CustomError } from '../utils/errors';
import { UserService } from '../services/user.service';
import { clerk } from '../utils/clerk';

// Extend the Request type to include Clerk's auth property
interface ClerkRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
  };
}

// Our custom authenticated request with user info
export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    sessionId: string;
    user: {
      id: string;
      username: string;
      email?: string;
    };
  };
}

// Helper function to extract the best username from Clerk user data
const extractUsername = (clerkUserData: any) => {
  console.log('Extracting username from Clerk data:', clerkUserData);
  return clerkUserData.username || 
         clerkUserData.primaryEmailAddress?.emailAddress?.split('@')[0] || 
         `user_${clerkUserData.id.slice(0, 5)}`;
};

// Create a middleware that wraps Clerk's middleware and adds our custom user info
export const requireAuth = async (
  req: ClerkRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    // First, use Clerk's built-in middleware
    await ClerkExpressRequireAuth()(req, _res, async (error) => {
      if (error) {
        console.error('Clerk auth error:', error);
        return next(new CustomError('Unauthorized', 401));
      }

      try {
        // At this point, the request is authenticated by Clerk
        const clerkUser = req.auth;
        console.log('Clerk user data:', clerkUser);
        
        if (!clerkUser) {
          console.error('No clerk user found in request');
          throw new CustomError('User not found', 404);
        }

        // Get the user data from Clerk
        const clerkUserData = await clerk.users.getUser(clerkUser.userId);
        const username = extractUsername(clerkUserData);

        // Sync user with our database
        const dbUser = await UserService.findOrCreateUser({
          id: clerkUser.userId,
          username: username,
          email: clerkUserData.primaryEmailAddress?.emailAddress
        });

        console.log('User synced with database:', dbUser);

        // Add our custom user info to the request while preserving Clerk's auth info
        const authReq = req as AuthenticatedRequest;
        authReq.auth = {
          ...clerkUser,
          user: {
            id: dbUser.id,
            username: dbUser.username,
            email: dbUser.email || undefined
          }
        };

        next();
      } catch (error) {
        console.error('Error processing authenticated user:', error);
        next(error);
      }
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    next(new CustomError('Unauthorized', 401));
  }
};

// Optional auth middleware that doesn't require authentication but adds user info if available
export const optionalAuth = async (
  req: ClerkRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Try to authenticate, but don't require it
    await ClerkExpressRequireAuth()(req, _res, async (error) => {
      if (!error && req.auth) {
        try {
          const clerkUser = req.auth;
          console.log('Optional auth - Clerk user data:', clerkUser);

          // Get the user data from Clerk
          const clerkUserData = await clerk.users.getUser(clerkUser.userId);
          const username = extractUsername(clerkUserData);

          // Sync user with our database
          const dbUser = await UserService.findOrCreateUser({
            id: clerkUser.userId,
            username: username,
            email: clerkUserData.primaryEmailAddress?.emailAddress
          });

          console.log('Optional auth - User synced with database:', dbUser);

          // Add our custom user info to the request while preserving Clerk's auth info
          const authReq = req as AuthenticatedRequest;
          authReq.auth = {
            ...clerkUser,
            user: {
              id: dbUser.id,
              username: dbUser.username,
              email: dbUser.email || undefined
            }
          };
        } catch (error) {
          // Ignore errors in optional auth
          console.warn('Optional auth error:', error);
        }
      }
      next();
    });
  } catch (error) {
    // Ignore errors in optional auth
    console.warn('Optional auth error:', error);
    next();
  }
}; 