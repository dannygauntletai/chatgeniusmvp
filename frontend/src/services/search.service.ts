import { FileObject, fileService } from './file.service';

export interface SearchResult {
  type: 'message' | 'file';
  id: string;
  title: string;
  content: string;
  channelId?: string;
  channelName?: string;
  timestamp?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
}

class SearchService {
  async searchAll(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    try {
      const [messageResults, fileResults] = await Promise.all([
        this.searchMessages(query),
        this.searchFiles(query)
      ]);

      return [...messageResults, ...fileResults];
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  async searchMessages(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    // TODO: Implement real message search when backend is ready
    // For now, return empty array
    return [];
  }

  async searchFiles(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    try {
      const files = await fileService.listFiles();
      
      return files
        .filter(file => 
          file.name.toLowerCase().includes(query.toLowerCase()) ||
          file.type.toLowerCase().includes(query.toLowerCase())
        )
        .map(file => ({
          type: 'file',
          id: file.id,
          title: file.name,
          content: `${file.type} - ${formatFileSize(file.size)}`,
          fileUrl: file.url,
          fileType: file.type,
          fileSize: file.size,
          timestamp: file.createdAt
        }));
    } catch (error) {
      console.error('File search error:', error);
      throw error;
    }
  }
}

// Helper function to format file size
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const searchService = new SearchService(); 