import { Request, Response } from 'express';
import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const ASSISTANT_SERVICE_URL = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';


export class DocumentController {
  async processWebhook(req: Request, res: Response) {
    try {
      const { file_id, file_url, channel_id, uploader_id, name, type } = req.body;
      
      if (!file_id || !file_url) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      console.log('Forwarding document to processing service:', { file_id, name, type });

      // Forward the request to the Python document service
      try {
        const response = await fetch(`${ASSISTANT_SERVICE_URL}/document/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            file_id,
            file_url,
            channel_id,
            uploader_id,
            file_name: name,
            file_type: type
          })
        });

        if (!response.ok) {
          throw new Error(`Document service error: ${response.statusText}`);
        }

        return res.json({ 
          status: 'success',
          message: 'Document processing initiated'
        });

      } catch (processingError) {
        console.error('Error forwarding to document service:', processingError);
        await this.updateFileStatus(file_id, 'FAILED');
        return res.status(500).json({ error: 'Failed to process document' });
      }

    } catch (error) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async updateFileStatus(fileId: string, status: string) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/files/${fileId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        throw new Error(`Failed to update file status: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error updating file status:', error);
      throw error;
    }
  }
} 