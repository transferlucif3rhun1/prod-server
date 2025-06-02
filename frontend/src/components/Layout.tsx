import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  Settings,
  FileText,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Activity,
  Users,
  Clock,
  Database,
  Wifi,
  WifiOff,
  Bell,
  AlertCircle,
  CheckCircle,
  Zap
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import { useStore } from '../store/useStore';
import apiService from '../services/api';
import { SystemStats } from '../types';
import toast from 'react-hot-toast';

const Layout: React.FC = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const { 
    sidebarCollapsed, 
    setSidebarCollapsed,
    stats,
    setStats,
    apiKeys
  } = useStore();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const { isConnected } = useWebSocket();

  const navigation = [
    { 
      name: 'Create Key', 
      href: '/create', 
      icon: Key,
      description: 'Generate new API keys'
    },
    { 
      name: 'Manage Keys', 
      href: '/manage', 
      icon: Settings,
      description: 'View and edit existing keys'
    },
    { 
      name: 'Logs', 
      href: '/logs', 
      icon: FileText,
      description: 'System logs and monitoring'
    },
  ];

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiService.getHealth();
        setStats(response.stats);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [setStats]);

  const toggleTheme = () => {
    const newIsDark = !isDarkMode;
    setIsDarkMode(newIsDark);
    
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    window.location.href = '/login';
  };

  const getPageTitle = () => {
    const path = location.pathname;
    switch (path) {
      case '/create': return 'Create API Key';
      case '/manage': return 'Manage Keys';
      case '/logs': return 'System Logs';
      default: return 'Dashboard';
    }
  };

  const getPageDescription = () => {
    const path = location.pathname;
    switch (path) {
      case '/create': return 'Generate new API keys with custom configuration';
      case '/manage': return 'View, edit, and manage your existing API keys';
      case '/logs': return 'Monitor system activity and troubleshoot issues';
      default: return 'Professional API key management system';
    }
  };

  const getActiveKeysCount = () => {
    const now = new Date();
    return apiKeys.filter(key => key.isActive && new Date(key.expiration) > now).length;
  };

  const getExpiredKeysCount = () => {
    const now = new Date();
    return apiKeys.filter(key => new Date(key.expiration) <= now).length;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 80 : 280 }}
        className="bg-white dark:bg-gray-800 shadow-xl border-r border-gray-200 dark:border-gray-700 flex flex-col relative z-20"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center space-x-3"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Key className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                    API Manager
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Professional System
                  </p>
                </div>
              </motion.div>
            )}
            
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={`relative flex items-center rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${sidebarCollapsed ? 'p-3 justify-center' : 'p-4'}`}
              >
                <Icon className={`${sidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0`} />
                {!sidebarCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="ml-3"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs opacity-75">{item.description}</div>
                  </motion.div>
                )}
                
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl"
                    style={{ zIndex: -1 }}
                  />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Stats */}
        {!sidebarCollapsed && stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 border-t border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              System Status
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-green-500" />
                  <span className="text-gray-600 dark:text-gray-400">Active Keys</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {getActiveKeysCount()}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="text-gray-600 dark:text-gray-400">Uptime</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatUptime(stats.uptime)}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Database className={`w-4 h-4 ${stats.mongoStatus ? 'text-green-500' : 'text-red-500'}`} />
                  <span className="text-gray-600 dark:text-gray-400">Database</span>
                </div>
                <span className={`font-medium ${stats.mongoStatus ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {stats.mongoStatus ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span className="text-gray-600 dark:text-gray-400">Memory</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatMemory(stats.memoryUsage)}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className={`p-4 border-t border-gray-200 dark:border-gray-700 ${sidebarCollapsed ? 'space-y-2' : 'space-y-3'}`}>
          <div className={`flex ${sidebarCollapsed ? 'flex-col items-center space-y-2' : 'items-center justify-between'}`}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </motion.button>

            <div className={`flex items-center space-x-2 ${sidebarCollapsed ? 'flex-col space-y-2 space-x-0' : ''}`}>
              <div className={`flex items-center space-x-1 ${sidebarCollapsed ? 'justify-center' : ''}`}>
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                {!sidebarCollapsed && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {getPageTitle()}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {getPageDescription()}
              </p>
            </div>

            <div className="flex items-center space-x-4">
              {/* Quick Stats */}
              <div className="hidden lg:flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {getActiveKeysCount()} Active
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {apiKeys.length} Total
                  </span>
                </div>
                
                {getExpiredKeysCount() > 0 && (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-sm text-yellow-600 dark:text-yellow-400">
                      {getExpiredKeysCount()} Expired
                    </span>
                  </div>
                )}
              </div>

              {/* Mobile menu button - only show when sidebar is collapsed */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setSidebarCollapsed(false)}
                className="lg:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Menu className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {!sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarCollapsed(true)}
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-10"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Layout;