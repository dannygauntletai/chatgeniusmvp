import { FileObject } from '../types/file';

export type { FileObject };

class FileService {
  async listFiles(channelId: string): Promise<FileObject[]> {
    try {
      const response = await fetch(`/api/files/channel/${channelId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      const files = await response.json();
      return files;
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

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
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
      const response = await fetch(`/api/files/user/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user files');
      }

      const files = await response.json();
      return files;
    } catch (error) {
      console.error('Error fetching user files:', error);
      throw error;
    }
  }
}

export const fileService = new FileService(); 