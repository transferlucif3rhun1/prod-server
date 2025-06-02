import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store/useStore';
import Layout from './components/Layout';
import Login from './components/Login';
import CreateKey from './components/CreateKey';
import ManageKeys from './components/ManageKeys';
import Logs from './components/Logs';
import { WSEvent } from './types';
import toast from 'react-hot-toast';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { setCurrentPage } = useStore();
  
  // Handle WebSocket messages globally
  const handleWebSocketMessage = (event: WSEvent) => {
    // Global WebSocket message handling
    switch (event.type) {
      case 'system_update':
        if (event.data?.message) {
          toast.success(event.data.message);
        }
        break;
      case 'error':
        if (event.data?.message) {
          toast.error(event.data.message);
        }
        break;
      default:
        // Other events are handled by the store
        break;
    }
  };

  // Initialize WebSocket connection
  const { isConnected } = useWebSocket(handleWebSocketMessage);

  // Set theme based on user preference or system preference
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Update current page in store
  useEffect(() => {
    const path = window.location.pathname;
    setCurrentPage(path);
  }, [setCurrentPage]);

  // Show connection status
  useEffect(() => {
    if (isAuthenticated) {
      if (isConnected) {
        toast.success('Real-time connection established', { id: 'ws-status' });
      } else {
        toast.error('Real-time connection lost', { id: 'ws-status' });
      }
    }
  }, [isConnected, isAuthenticated]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-50 dark:bg-gray-900"
    >
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <Login />
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
          <Route path="create" element={<CreateKey />} />
          <Route path="manage" element={<ManageKeys />} />
          <Route path="logs" element={<Logs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </motion.div>
  );
};

export default App;