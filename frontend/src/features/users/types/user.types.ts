export interface User {
  id: string;
  username: string;
  email: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStatus {
  userId: string;
  status: 'online' | 'offline' | 'away';
  customStatus?: string;
} 