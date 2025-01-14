export interface User {
  id: string;
  username: string;
  email?: string;
  status?: string;
  user_status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStatus {
  id: string;
  status: string;
} 