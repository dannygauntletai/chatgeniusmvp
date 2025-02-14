export interface FileObject {
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