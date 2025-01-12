import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const BUCKET_NAME = 'chat-genius-files';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and key must be defined in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export interface FileObject {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

class FileService {
  async listFiles(): Promise<FileObject[]> {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list('uploads');

      if (error) {
        throw error;
      }

      const files = await Promise.all(
        data.map(async (file) => {
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(`uploads/${file.name}`);

          const originalName = file.name.replace(/^\d+-/, '').replace(/_/g, ' ');

          return {
            id: file.id,
            name: originalName,
            size: file.metadata?.size || 0,
            type: file.metadata?.mimetype || 'application/octet-stream',
            url: urlData.publicUrl,
            createdAt: file.created_at,
            updatedAt: file.updated_at || file.created_at,
          };
        })
      );

      return files.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  async uploadFile(file: File): Promise<FileObject> {
    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}-${safeFileName}`;
      const filePath = `uploads/${uniqueFileName}`;

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (error) {
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      return {
        id: data.id,
        name: file.name,
        type: file.type,
        size: file.size,
        url: urlData.publicUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([`uploads/${fileId}`]);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
}

export const fileService = new FileService(); 