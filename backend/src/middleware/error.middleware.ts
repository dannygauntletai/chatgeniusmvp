import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { CustomError } from '../utils/errors';
import { PrismaClientKnownRequestError, PrismaClientInitializationError } from '@prisma/client/runtime/library';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error details:', {
    name: err.name,
    message: err.message,
    stack: err.stack
  });

  if (err instanceof CustomError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode
      }
    });
    return;
  }

  // Handle Clerk errors
  if (err.name === 'ClerkError') {
    res.status(401).json({
      error: {
        message: 'Authentication failed',
        status: 401
      }
    });
    return;
  }

  // Handle Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    console.error('Prisma error:', err.code, err.message);
    res.status(400).json({
      error: {
        message: 'Database operation failed',
        code: err.code,
        status: 400
      }
    });
    return;
  }

  if (err instanceof PrismaClientInitializationError) {
    console.error('Prisma initialization error:', err.message);
    res.status(500).json({
      error: {
        message: 'Database connection failed',
        status: 500
      }
    });
    return;
  }

  // Default error
  res.status(500).json({
    error: {
      message: 'Internal server error',
      status: 500
    }
  });
}; 