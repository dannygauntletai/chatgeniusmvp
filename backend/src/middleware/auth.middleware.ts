import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../utils/errors';

export const authenticateToken = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Temporary auth middleware until we implement proper JWT
    (req as any).user = { id: 'test-user-id' };
    next();
  } catch (error) {
    next(new CustomError('Unauthorized', 401));
  }
}; 