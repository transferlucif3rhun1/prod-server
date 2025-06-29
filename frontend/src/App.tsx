import React, { useEffect, Suspense, lazy, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store/useStore';
import ErrorBoundary from './components/ErrorBoundary';
import { WSEvent } from './types';
import toast from 'react-hot-toast';

const Layout = lazy(() => import('./components/Layout'));
const Login = lazy(() => import('./components/Login'));
const CreateKey = lazy(() => import('./components/CreateKey'));
const ManageKeys = lazy(() => import('./components/ManageKeys'));
const Logs = lazy(() => import('./components/Logs'));

const LoadingSpinner = ({ message = 'Loading...' }: { message?: string }) => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-4"
    >
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
      <p className="text-gray-600 dark:text-gray-400">{message}</p>
    </motion.div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
};

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { setCurrentPage, updateConnectionStatus } = useStore();
  const location = useLocation();
  
  const handleWebSocketMessage = useCallback((event: WSEvent) => {
    try {
      switch (event.type) {
        case 'system_update':
          if (event.data && typeof event.data === 'object' && 'message' in event.data) {
            toast.success(String(event.data.message), { 
              duration: 4000,
              id: 'system-update'
            });
          }
          break;
        case 'error':
          if (event.data && typeof event.data === 'object' && 'message' in event.data) {
            toast.error(String(event.data.message), {
              duration: 5000,
              id: 'system-error'
            });
          }
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message in App:', error);
    }
  }, []);

  const { isConnected, connectionState, getConnectionStatus } = useWebSocket(
    isAuthenticated ? handleWebSocketMessage : undefined
  );

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
      }
    };

    initializeTheme();

    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleThemeChange = (e: MediaQueryListEvent) => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === null) {
          if (e.matches) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      };

      mediaQuery.addEventListener('change', handleThemeChange);
      return () => mediaQuery.removeEventListener('change', handleThemeChange);
    }
  }, []);

  useEffect(() => {
    setCurrentPage(location.pathname);
  }, [location.pathname, setCurrentPage]);

  useEffect(() => {
    updateConnectionStatus({ 
      websocket: isConnected,
      lastCheck: new Date()
    });
  }, [isConnected, updateConnectionStatus]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const connectionStatus = getConnectionStatus();
    const toastId = 'ws-status';

    switch (connectionState) {
      case 'connected':
        toast.dismiss(toastId);
        toast.success('Real-time connection established', { 
          id: toastId,
          duration: 2000
        });
        break;
      case 'reconnecting':
        toast.loading(`Reconnecting... (${connectionStatus.reconnectAttempts}/${connectionStatus.maxReconnectAttempts})`, { 
          id: toastId
        });
        break;
      case 'disconnected':
        if (connectionStatus.reconnectAttempts > 0) {
          toast.error('Real-time connection lost', { 
            id: toastId,
            duration: 5000
          });
        }
        break;
    }
  }, [connectionState, isAuthenticated, getConnectionStatus]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      const reason = event.reason as Error;
      if (reason?.message?.includes('401') || reason?.message?.includes('Unauthorized')) {
        toast.error('Your session has expired. Please log in again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (reason?.message?.includes('Network Error')) {
        toast.error('Network connection problem. Please check your internet connection.');
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
      
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      
      const error = event.error as Error;
      if (error?.message?.includes('ChunkLoadError')) {
        toast.error('Unable to load application components. Please refresh the page.');
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      updateConnectionStatus({ api: true });
      toast.success('Connection restored', { id: 'network-status' });
    };

    const handleOffline = () => {
      updateConnectionStatus({ api: false });
      toast.error('You are offline. Some features may not be available.', { 
        id: 'network-status',
        duration: 0
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateConnectionStatus({ api: navigator.onLine });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateConnectionStatus]);

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

    try {
      if (typeof localStorage !== 'undefined') {
        const existingErrors = JSON.parse(localStorage.getItem('app_errors') || '[]');
        existingErrors.push(errorData);
        
        const recentErrors = existingErrors.slice(-10);
        localStorage.setItem('app_errors', JSON.stringify(recentErrors));
      }
    } catch (storageError) {
      console.error('Failed to store error data:', storageError);
    }

    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'exception', {
        description: error.message,
        fatal: true
      });
    }
  }, [location.pathname]);

  return (
    <ErrorBoundary onError={handleGlobalError}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-gray-50 dark:bg-gray-900"
      >
        <Suspense fallback={<LoadingSpinner message="Loading application..." />}>
          <Routes>
            <Route
              path="/login"
              element={
                isAuthenticated ? (
                  <Navigate to="/" replace />
                ) : (
                  <ErrorBoundary>
                    <Login />
                  </ErrorBoundary>
                )
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/create" replace />} />
              <Route 
                path="create" 
                element={
                  <Suspense fallback={<LoadingSpinner message="Loading key creation form..." />}>
                    <CreateKey />
                  </Suspense>
                } 
              />
              <Route 
                path="manage" 
                element={
                  <Suspense fallback={<LoadingSpinner message="Loading key management..." />}>
                    <ManageKeys />
                  </Suspense>
                } 
              />
              <Route 
                path="logs" 
                element={
                  <Suspense fallback={<LoadingSpinner message="Loading system logs..." />}>
                    <Logs />
                  </Suspense>
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
        </Suspense>

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