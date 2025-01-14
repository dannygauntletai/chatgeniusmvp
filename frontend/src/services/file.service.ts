import { api } from './api.service';
import { API_URL } from '../config';

interface FileObject {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
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
  async listFiles(channelId: string): Promise<FileObject[]> {
    try {
      return await api.get<FileObject[]>(`/files/channel/${channelId}`);
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  async uploadFile(file: File, channelId: string, userId: string): Promise<FileObject> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('channelId', channelId);
      formData.append('userId', userId);

      const response = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async getUserFiles(userId: string): Promise<FileObject[]> {
    try {
      return await api.get<FileObject[]>(`/files/user/${userId}`);
    } catch (error) {
      console.error('Error fetching user files:', error);
      throw error;
    }
  }
}

export const fileService = new FileService(); 