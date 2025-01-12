import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const BUCKET_NAME = 'chat-genius-files';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and key must be defined in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export interface FileObject {
  name: string;
  size: number;
  type: string;
  url: string;
  created_at: string;
}

export class FileService {
  static async uploadFile(file: File) {
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
        url: urlData.publicUrl,
        name: file.name,
        size: file.size,
        type: file.type,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  static async uploadFiles(files: File[]) {
    return Promise.all(files.map(file => this.uploadFile(file)));
  }

  static async listFiles(): Promise<FileObject[]> {
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
            name: originalName,
            size: file.metadata?.size || 0,
            type: file.metadata?.mimetype || 'application/octet-stream',
            url: urlData.publicUrl,
            created_at: file.created_at
          };
        })
      );

      return files.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }
} 