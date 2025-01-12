import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(err);

  if (err instanceof CustomError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode
      }
    });
  }

  // Handle Clerk errors
  if (err.name === 'ClerkError') {
    return res.status(401).json({
      error: {
        message: 'Authentication failed',
        status: 401
      }
    });
  }

  // Default error
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      status: 500
    }
  });
}; 