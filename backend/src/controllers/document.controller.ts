import { Request, Response } from 'express';
import { DocumentService } from '../services/document.service';

const documentService = new DocumentService();

export class DocumentController {
  async processWebhook(req: Request, res: Response) {
    try {
      console.log('\n=== DOCUMENT WEBHOOK RECEIVED ===');
      console.log('Request body:', req.body);
      console.log('Request headers:', req.headers);

      const { file_id, file_url, channel_id, uploader_id, name, type } = req.body;
      
      if (!file_id || !file_url) {
        console.error('Missing required fields:', { file_id, file_url });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await documentService.processDocument({
        file_id,
        file_url,
        channel_id,
        uploader_id,
        file_name: name,
        file_type: type
      });

      return res.json({ 
        status: 'success',
        message: 'Document processing initiated',
        data: result
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
} 