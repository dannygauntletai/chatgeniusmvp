import { Router } from 'express';
import multer from 'multer';
import { FileController } from '../controllers/file.controller';
import { DocumentController } from '../controllers/document.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { Request } from 'express';

// Add MulterRequest type
interface MulterRequest extends Request {
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
router.post('/upload', requireAuth, upload.single('file'), (req: MulterRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  return fileController.uploadFile(req as MulterRequest, res);
});

// Get files for a channel
router.get('/channel/:channelId', requireAuth, (req, res) =>
  fileController.getChannelFiles(req, res)
);

// Get files for a user
router.get('/user/:userId', requireAuth, (req, res) =>
  fileController.getUserFiles(req, res)
);

// Update file status - no auth required as it's called by document service
router.put('/:fileId/status', (req, res) =>
  fileController.updateFileStatus(req, res)
);

// Document processing webhook - no auth required as it's called by Supabase
router.post('/webhook/process', (req, res) =>
  documentController.processWebhook(req, res)
);

export default router; 