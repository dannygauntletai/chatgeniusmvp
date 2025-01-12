import { FileObject, fileService } from './file.service';

export type SearchResultType = 'message' | 'file' | 'channel';
export type SearchLocation = 'Files' | 'Messages' | string; // string for channel names

export interface SearchResult {
  type: SearchResultType;
  id: string;
  location: SearchLocation;  // Where the result was found (Files, Messages, or channel name)
  content: string;          // The actual content to display and highlight
  metadata?: {             // Optional metadata specific to each type
    channelId?: string;
    channelName?: string;
    timestamp?: string;
    fileUrl?: string;
    fileType?: string;
    fileSize?: number;
  };
}

interface SearchProvider {
  type: SearchResultType;
  search: (query: string) => Promise<SearchResult[]>;
}

class FileSearchProvider implements SearchProvider {
  type: SearchResultType = 'file';

  async search(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    try {
      const files = await fileService.listFiles();
      const searchTerm = query.toLowerCase();
      
      return files
        .filter(file => file.name.toLowerCase().includes(searchTerm))
        .map(file => ({
          type: this.type,
          id: file.id,
          location: 'Files',
          content: file.name,
          metadata: {
            fileUrl: file.url,
            fileType: file.type,
            fileSize: file.size,
            timestamp: file.createdAt
          }
        }));
    } catch (error) {
      console.error('File search error:', error);
      throw error;
    }
  }
}

class MessageSearchProvider implements SearchProvider {
  type: SearchResultType = 'message';

  async search(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    // TODO: Implement real message search when backend is ready
    // Example implementation:
    // const messages = await messageService.searchMessages(query);
    // return messages.map(msg => ({
    //   type: this.type,
    //   id: msg.id,
    //   location: msg.channelName,
    //   content: msg.text,
    //   metadata: {
    //     channelId: msg.channelId,
    //     channelName: msg.channelName,
    //     timestamp: msg.timestamp
    //   }
    // }));
    return [];
  }
}

class SearchService {
  private providers: SearchProvider[] = [
    new FileSearchProvider(),
    new MessageSearchProvider()
  ];

  async searchAll(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    try {
      const results = await Promise.all(
        this.providers.map(provider => provider.search(query))
      );

      return results.flat();
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  // Method to add new search providers
  registerProvider(provider: SearchProvider) {
    this.providers.push(provider);
  }
}

export const searchService = new SearchService(); 