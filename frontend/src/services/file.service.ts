import { FileObject } from '../types/file';
import { api } from './api.service';

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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/files/upload`, {
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

      const fileObject = await response.json();
      return fileObject;
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