export interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  owner: {
    id: string;
    username: string;
  };
  members?: {
    id: string;
    username: string;
    status?: string;
    user_status?: string;
  }[];
  _count?: {
    members: number;
  };
}

export interface Member {
  channelId: string;
  userId: string;
} 