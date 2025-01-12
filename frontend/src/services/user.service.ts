import { api } from './api.service';
import { User } from '../features/users/types/user.types';

export const UserService = {
  getUsers: async (): Promise<User[]> => {
    const response = await api.get('/api/users');
    if (!response || !Array.isArray(response)) {
      throw new Error('Invalid response format from server');
    }
    return response;
  },

  getUserById: async (userId: string): Promise<User> => {
    const response = await api.get(`/api/users/${userId}`);
    return response;
  }
}; 