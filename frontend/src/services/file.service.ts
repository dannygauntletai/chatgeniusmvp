import { api } from './api.service';
import { API_URL } from '../config';

declare global {
  interface Window {
    __clerk__: any;
  }
}

interface FileObject {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  channelId: string;
  userId: string;
  user?: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  channel?: {
    id: string;
    name: string;
  };
}

export type { FileObject };

class FileService {
  private publicBucketId: string | null = null;

  private async getPublicBucketId(): Promise<string> {
    try {
      if (this.publicBucketId) {
        return this.publicBucketId;
      }

      // Get the public bucket channel
      const response = await api.get('/api/channels/public');
      if (!response.id) {
        throw new Error('Public bucket not found');
      }
      this.publicBucketId = response.id;
      return response.id;
    } catch (error) {
      console.error('Error getting public bucket:', error);
      throw error;
    }
  }

  async listFiles(channelId?: string): Promise<FileObject[]> {
    try {
      // If no channelId provided, get all files
      if (!channelId) {
        console.log('Fetching all files');
        const response = await api.get('/api/files');
        console.log('Files response:', response);
        return response as FileObject[];
      }

      // Otherwise get files for specific channel
      console.log('Fetching files for channel:', channelId);
      const response = await api.get(`/api/files/channel/${channelId}`);
      console.log('Files response:', response);
      return response as FileObject[];
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  async uploadFile(file: File, channelId?: string): Promise<FileObject> {
    try {
      console.log(`Starting file upload - Name: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`);
      
      const formData = new FormData();
      formData.append('file', file);
      
      // If no channelId provided, get the public bucket ID
      const targetChannelId = channelId || await this.getPublicBucketId();
      console.log(`Using channel ID: ${targetChannelId}`);
      formData.append('channelId', targetChannelId);

      // Use the api service which handles auth
      console.log('Initiating upload request to server...');
      const response = await api.post('/api/files/upload', formData, true);
      console.log('File upload successful:', response);
      return response as FileObject;
    } catch (error) {
      console.error('File upload failed with details:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      });
      throw error;
    }
  }

  async getUserFiles(userId: string): Promise<FileObject[]> {
    try {
      const response = await api.get(`/api/files/user/${userId}`);
      return response as FileObject[];
    } catch (error) {
      console.error('Error getting user files:', error);
      throw error;
    }
  }
}

export const fileService = new FileService(); 