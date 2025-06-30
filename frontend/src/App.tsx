import React, { useEffect, Suspense, lazy, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store/useStore';
import ErrorBoundary from './components/ErrorBoundary';
import { LoadingSpinner } from './components/shared';
import { WSEvent } from './types';
import toast from 'react-hot-toast';

// Lazy load components for better performance
const Layout = lazy(() => import('./components/Layout'));
const Login = lazy(() => import('./components/Login'));
const CreateKey = lazy(() => import('./components/CreateKey'));
const ManageKeys = lazy(() => import('./components/ManageKeys'));
const Logs = lazy(() => import('./components/Logs'));

// Enhanced loading component with error handling
const SuspenseWrapper: React.FC<{ 
  children: React.ReactNode; 
  fallback?: React.ReactNode;
  identifier?: string;
}> = ({ children, fallback, identifier }) => {
  const defaultFallback = (
    <LoadingSpinner 
      message={`Loading ${identifier || 'application'}...`} 
      overlay={!identifier}
    />
  );

  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Failed to load {identifier || 'component'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      }
    >
      <Suspense fallback={fallback || defaultFallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};

// Protected route wrapper with better error handling
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
};

// Toast manager to prevent spam and handle deduplication
class ToastManager {
  private static instance: ToastManager;
  private lastToasts: Map<string, number> = new Map();
  private readonly MIN_INTERVAL = 3000; // 3 seconds minimum between same messages

  static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info', id?: string) {
    const toastId = id || message;
    const now = Date.now();
    const lastTime = this.lastToasts.get(toastId) || 0;

    if (now - lastTime >= this.MIN_INTERVAL) {
      switch (type) {
        case 'success':
          toast.success(message, { id: toastId, duration: 3000 });
          break;
        case 'error':
          toast.error(message, { id: toastId, duration: 5000 });
          break;
        default:
          toast(message, { id: toastId, duration: 4000 });
      }
      this.lastToasts.set(toastId, now);
    }
  }

  dismissAll() {
    toast.dismiss();
  }
}

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { setCurrentPage, updateConnectionStatus } = useStore();
  const location = useLocation();
  
  const toastManager = ToastManager.getInstance();

  // WebSocket message handler with improved error handling
  const handleWebSocketMessage = useCallback((event: WSEvent) => {
    try {
      switch (event.type) {
        case 'system_update':
          if (event.data && typeof event.data === 'object' && 'message' in event.data) {
            toastManager.showToast(
              String(event.data.message), 
              'success',
              'system-update'
            );
          }
          break;
        case 'error':
          if (event.data && typeof event.data === 'object' && 'message' in event.data) {
            toastManager.showToast(
              String(event.data.message),
              'error',
              'system-error'
            );
          }
          break;
        default:
          // Other message types are handled in the WebSocket hook
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message in App:', error);
    }
  }, [toastManager]);

  // Initialize WebSocket with better configuration
  const { isConnected, connectionState } = useWebSocket({
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    heartbeatInterval: 30000,
    onMessage: isAuthenticated ? handleWebSocketMessage : undefined
  });

  // Theme initialization with error handling
  useEffect(() => {
    const initializeTheme = () => {
      try {
        if (typeof window === 'undefined') return;
        
        const storedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (error) {
        console.error('Error initializing theme:', error);
        // Fallback to light theme
        document.documentElement.classList.remove('dark');
      }
    };

    initializeTheme();

    // Listen for system theme changes
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleThemeChange = (e: MediaQueryListEvent) => {
        try {
          const storedTheme = localStorage.getItem('theme');
          if (storedTheme === null) { // Only apply system theme if no user preference
            if (e.matches) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
        } catch (error) {
          console.error('Error handling theme change:', error);
        }
      };

      mediaQuery.addEventListener('change', handleThemeChange);
      return () => mediaQuery.removeEventListener('change', handleThemeChange);
    }
  }, []);

  // Update current page in store
  useEffect(() => {
    setCurrentPage(location.pathname);
  }, [location.pathname, setCurrentPage]);

  // Update connection status
  useEffect(() => {
    updateConnectionStatus({ 
      websocket: isConnected,
      lastCheck: new Date()
    });
  }, [isConnected, updateConnectionStatus]);

  // Connection state notifications with deduplication
  useEffect(() => {
    if (!isAuthenticated) return;

    const toastId = 'ws-status';

    switch (connectionState) {
      case 'connected':
        toastManager.showToast(
          'Real-time connection established', 
          'success',
          toastId
        );
        break;
      case 'disconnected':
        // Only show disconnection toast if we were previously connected
        if (isConnected) {
          toastManager.showToast(
            'Real-time connection lost', 
            'error',
            toastId
          );
        }
        break;
      case 'reconnecting':
        toastManager.showToast(
          'Reconnecting to real-time services...', 
          'info',
          toastId
        );
        break;
      // 'connecting' state doesn't need a toast
    }
  }, [connectionState, isAuthenticated, isConnected, toastManager]);

  // Global error handling
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      const reason = event.reason as Error;
      
      // Handle specific error types
      if (reason?.message?.includes('401') || reason?.message?.includes('Unauthorized')) {
        toastManager.showToast(
          'Your session has expired. Please log in again.',
          'error',
          'session-expired'
        );
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (reason?.message?.includes('Network Error') || reason?.message?.includes('fetch')) {
        toastManager.showToast(
          'Network connection problem. Please check your internet connection.',
          'error',
          'network-error'
        );
      } else if (!reason?.message?.includes('ChunkLoadError')) {
        // Don't show toast for chunk load errors as they're handled elsewhere
        toastManager.showToast(
          'An unexpected error occurred. Please try again.',
          'error',
          'unexpected-error'
        );
      }
      
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      
      const error = event.error as Error;
      if (error?.message?.includes('ChunkLoadError') || error?.message?.includes('Loading chunk')) {
        toastManager.showToast(
          'Unable to load application components. Please refresh the page.',
          'error',
          'chunk-error'
        );
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [toastManager]);

  // Network status monitoring
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      updateConnectionStatus({ api: true });
      toastManager.showToast(
        'Connection restored', 
        'success',
        'network-status'
      );
    };

    const handleOffline = () => {
      updateConnectionStatus({ api: false });
      toastManager.showToast(
        'You are offline. Some features may not be available.', 
        'error',
        'network-status'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial network status
    updateConnectionStatus({ api: navigator.onLine });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateConnectionStatus, toastManager]);

  // Global error handler for ErrorBoundary
  const handleGlobalError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    console.error('Application Error Boundary triggered:', error, errorInfo);
    
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      pathname: location.pathname,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };

    // Store error data for debugging (with size limit)
    try {
      if (typeof localStorage !== 'undefined') {
        const existingErrors = JSON.parse(localStorage.getItem('app_errors') || '[]');
        existingErrors.push(errorData);
        
        // Keep only the last 10 errors to prevent storage bloat
        const recentErrors = existingErrors.slice(-10);
        localStorage.setItem('app_errors', JSON.stringify(recentErrors));
      }
    } catch (storageError) {
      console.error('Failed to store error data:', storageError);
    }

    // Send to analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      try {
        (window as any).gtag('event', 'exception', {
          description: error.message,
          fatal: true
        });
      } catch (analyticsError) {
        console.error('Failed to send error to analytics:', analyticsError);
      }
    }
  }, [location.pathname]);

  return (
    <ErrorBoundary onError={handleGlobalError}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen bg-gray-50 dark:bg-gray-900"
      >
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/" replace />
              ) : (
                <SuspenseWrapper identifier="login page">
                  <Login />
                </SuspenseWrapper>
              )
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <SuspenseWrapper identifier="dashboard">
                  <Layout />
                </SuspenseWrapper>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/create" replace />} />
            <Route 
              path="create" 
              element={
                <SuspenseWrapper identifier="key creation form">
                  <CreateKey />
                </SuspenseWrapper>
              } 
            />
            <Route 
              path="manage" 
              element={
                <SuspenseWrapper identifier="key management">
                  <ManageKeys />
                </SuspenseWrapper>
              } 
            />
            <Route 
              path="logs" 
              element={
                <SuspenseWrapper identifier="system logs">
                  <Logs />
                </SuspenseWrapper>
              } 
            />
          </Route>
          <Route 
            path="*" 
            element={
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
                  <p className="text-gray-600 dark:text-gray-400">Page not found</p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => window.location.href = '/'}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Go Home
                  </motion.button>
                </div>
              </div>
            } 
          />
        </Routes>

        {/* Offline indicator */}
        <AnimatePresence>
          {typeof navigator !== 'undefined' && !navigator.onLine && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-0 left-0 right-0 bg-yellow-500 text-white text-center py-2 z-50"
            >
              <p className="text-sm font-medium">
                You are currently offline. Some features may not be available.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </ErrorBoundary>
  );
};

export default App;