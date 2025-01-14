import { Request } from 'express';
import { Multer as MulterType } from 'multer';

declare namespace Express {
  interface Request {
    user: {
      id: string;
    }
  }
}

declare global {
  namespace Express {
    interface Multer extends MulterType {}
  }
}

export {}; 