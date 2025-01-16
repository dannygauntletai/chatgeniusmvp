import fetch from 'node-fetch';
import { DocumentProcessingRequest } from '../types/file.types';

const ASSISTANT_SERVICE_URL = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';

export class DocumentService {
  async processDocument(data: DocumentProcessingRequest) {
    const { file_id, file_url, channel_id, uploader_id, file_name, file_type } = data;

    try {
      console.log('Sending document processing request to:', `${ASSISTANT_SERVICE_URL}/document/process`);
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
          file_name,
          file_type
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Document service error response:', errorText);
        throw new Error(`Document service error: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  }
} 