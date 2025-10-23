import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiService from '../services/api';
import { AuthState } from '../types';

interface ApiError {
  response?: {
    data?: {
      error?: string;
    };
  };
}

interface JWTPayload {
  exp: number;
  iat: number;
  sub: string;
  jti: string;
}

// Helper function to decode JWT payload without verification
const decodeJWTPayload = (token: string): JWTPayload | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JWTPayload;
  } catch {
    return null;
  }
};

// Check if token is expired
const isTokenExpired = (token: string): boolean => {
  const payload = decodeJWTPayload(token);
  if (!payload) return true;
  
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
};

// Check if token is valid (exists and not expired)
const isTokenValid = (token: string | null): boolean => {
  if (!token) return false;
  return !isTokenExpired(token);
};

// Clear all authentication data
const clearAuthData = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('app-storage');
    // Clear any other app-related storage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('error_') || key.startsWith('app_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => {
      // Initialize with token validation
      const storedToken = localStorage.getItem('token');
      const isValidToken = isTokenValid(storedToken);
      
      // If token is invalid, clear everything
      if (!isValidToken && storedToken) {
        clearAuthData();
      }

      return {
        isAuthenticated: isValidToken,
        token: isValidToken ? storedToken : null,

        login: async (password: string) => {
          try {
            // Clear any existing auth data before login
            clearAuthData();
            
            const response = await apiService.login(password);
            
            // Validate the received token
            if (!isTokenValid(response.token)) {
              throw new Error('Received invalid token from server');
            }
            
            localStorage.setItem('token', response.token);
            apiService.setAuthToken(response.token);
            
            set({ isAuthenticated: true, token: response.token });
            return true;
          } catch (error: unknown) {
            const apiError = error as ApiError;
            const errorMessage = apiError.response?.data?.error || 'Login failed';
            console.error('Login failed:', errorMessage);
            
            // Ensure clean state on login failure
            clearAuthData();
            set({ isAuthenticated: false, token: null });
            return false;
          }
        },

        logout: () => {
          clearAuthData();
          apiService.setAuthToken('');
          set({ isAuthenticated: false, token: null });
        },

        // New method to validate current token
        validateToken: () => {
          const currentToken = get().token;
          if (!isTokenValid(currentToken)) {
            get().logout();
            return false;
          }
          return true;
        },

        // New method to check token expiry and refresh if needed
        checkTokenExpiry: () => {
          const currentToken = get().token;
          if (!currentToken) return false;
          
          const payload = decodeJWTPayload(currentToken);
          if (!payload) {
            get().logout();
            return false;
          }
          
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = payload.exp - now;
          
          // If token expires in less than 5 minutes, consider it expired
          if (timeUntilExpiry < 300) {
            get().logout();
            return false;
          }
          
          return true;
        }
      };
    },
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        token: state.token,
        isAuthenticated: state.isAuthenticated 
      }),
      // Add version and migration for cleanup
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        // On any version change, validate stored token
        const state = (persistedState || {}) as { token?: string };
        if (state.token && !isTokenValid(state.token)) {
          clearAuthData();
          return {
            isAuthenticated: false,
            token: null,
            login: () => Promise.resolve(false),
            logout: () => {},
            validateToken: () => false,
            checkTokenExpiry: () => false
          };
        }
        return persistedState as AuthState;
      },
      // Add storage event listener for cross-tab auth sync
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Validate token after rehydration
          if (!state.validateToken()) {
            // Token was invalid, state already cleaned up by validateToken
            return;
          }
          
          // Set up periodic token validation
          const interval = setInterval(() => {
            if (!state.checkTokenExpiry()) {
              clearInterval(interval);
            }
          }, 60000); // Check every minute
          
          // Clean up interval when component unmounts
          if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
              clearInterval(interval);
            });
          }
        }
      }
    }
  )
);

// Add global error handler for authentication errors
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // Listen for token changes in other tabs
    if (e.key === 'token') {
      const { validateToken } = useAuth.getState();
      if (!validateToken()) {
        // Force reload to trigger logout redirect
        window.location.reload();
      }
    }
  });
}