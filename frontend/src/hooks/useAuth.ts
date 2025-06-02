import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiService from '../services/api';
import { AuthState } from '../types';

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: !!localStorage.getItem('token'),
      token: localStorage.getItem('token'),

      login: async (password: string) => {
        try {
          const response = await apiService.login(password);
          localStorage.setItem('token', response.token);
          set({ isAuthenticated: true, token: response.token });
          return true;
        } catch (error) {
          console.error('Login failed:', error);
          return false;
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ isAuthenticated: false, token: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
);