import { Router, Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { FileController } from '../controllers/file.controller';
import { DocumentController } from '../controllers/document.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthenticatedRequest } from '../types/request.types';

// Add MulterRequest type using the global Express namespace
interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

const router = Router();
const fileController = new FileController();
const documentController = new DocumentController();

// Configure multer for streaming files
const streamStorage = multer.memoryStorage();
const upload = multer({
  storage: streamStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// File upload endpoint
router.post('/upload', requireAuth, upload.single('file') as unknown as RequestHandler, async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  // The request has been authenticated by requireAuth middleware, so it's safe to cast
  const authenticatedReq = req as unknown as MulterRequest;
  await fileController.uploadFile(authenticatedReq, res);
});

// Get files for a channel
router.get('/channel/:channelId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  await fileController.getChannelFiles(req, res);
});

// Get files for a user
router.get('/user/:userId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  await fileController.getUserFiles(req, res);
});

// Document processing webhook - no auth required as it's called by Supabase
router.post('/webhook/process', async (req: Request, res: Response): Promise<void> => {
  await documentController.processWebhook(req, res);
});

export default router; 