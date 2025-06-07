import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
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
  Zap,
  TrendingUp,
  Server
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import { useStore } from '../store/useStore';
import apiService from '../services/api';
import { SystemStats } from '../types';
import toast from 'react-hot-toast';

const MetricCard = memo(({ icon: Icon, label, value, trend, color = 'blue', isLoading = false }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  trend?: number;
  color?: string;
  isLoading?: boolean;
}) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 shadow-sm"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className={`p-1.5 rounded-md bg-${color}-100 dark:bg-${color}-900/20`}>
          <Icon className={`w-4 h-4 text-${color}-600 dark:text-${color}-400`} />
        </div>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      {trend !== undefined && (
        <div className={`flex items-center text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          <TrendingUp className={`w-3 h-3 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <div className="mt-1">
      {isLoading ? (
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
      ) : (
        <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      )}
    </div>
  </motion.div>
));

MetricCard.displayName = 'MetricCard';

const NavigationItem = memo(({ item, isActive, sidebarCollapsed }: {
  item: { name: string; href: string; icon: React.ElementType; description: string };
  isActive: boolean;
  sidebarCollapsed: boolean;
}) => {
  const Icon = item.icon;
  
  return (
    <NavLink
      to={item.href}
      className={`relative flex items-center rounded-xl transition-all duration-200 group ${
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
          className="ml-3 flex-1"
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
      
      {sidebarCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
          {item.name}
        </div>
      )}
    </NavLink>
  );
});

NavigationItem.displayName = 'NavigationItem';

const Sidebar = memo(({ 
  sidebarCollapsed, 
  setSidebarCollapsed, 
  navigation, 
  location, 
  stats, 
  isStatsLoading,
  apiKeys,
  isDarkMode,
  toggleTheme,
  isConnected,
  handleLogout 
}: any) => {

  const getActiveKeysCount = useCallback(() => {
    const now = new Date();
    return apiKeys.filter((key: any) => key.isActive && new Date(key.expiration) > now).length;
  }, [apiKeys]);

  const formatUptime = useCallback((seconds: number) => {
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
  }, []);

  const formatMemory = useCallback((bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }, []);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 80 : 280 }}
      className="bg-white dark:bg-gray-800 shadow-xl border-r border-gray-200 dark:border-gray-700 flex flex-col relative z-20"
    >
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
                  Professional System v2.0
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

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigation.map((item: any) => (
          <NavigationItem
            key={item.name}
            item={item}
            isActive={location.pathname === item.href}
            sidebarCollapsed={sidebarCollapsed}
          />
        ))}
      </nav>

      {!sidebarCollapsed && stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 border-t border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            System Status
          </h3>
          
          <div className="space-y-2">
            <MetricCard
              icon={Activity}
              label="Active Keys"
              value={getActiveKeysCount()}
              color="green"
              isLoading={isStatsLoading}
            />
            
            <MetricCard
              icon={Clock}
              label="Uptime"
              value={formatUptime(stats.uptime)}
              color="blue"
              isLoading={isStatsLoading}
            />
            
            <MetricCard
              icon={Database}
              label="Database"
              value={stats.mongoStatus ? 'Connected' : 'Disconnected'}
              color={stats.mongoStatus ? 'green' : 'red'}
              isLoading={isStatsLoading}
            />
            
            <MetricCard
              icon={Zap}
              label="Memory"
              value={formatMemory(stats.memoryUsage)}
              color="yellow"
              isLoading={isStatsLoading}
            />
          </div>
        </motion.div>
      )}

      <div className={`p-4 border-t border-gray-200 dark:border-gray-700 ${sidebarCollapsed ? 'space-y-2' : 'space-y-3'}`}>
        <div className={`flex ${sidebarCollapsed ? 'flex-col items-center space-y-2' : 'items-center justify-between'}`}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTheme}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
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
  );
});

Sidebar.displayName = 'Sidebar';

const TopBar = memo(({ pageTitle, pageDescription, apiKeys, getActiveKeysCount, getExpiredKeysCount, setSidebarCollapsed }: any) => (
  <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {pageTitle}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {pageDescription}
        </p>
      </div>

      <div className="flex items-center space-x-4">
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
));

TopBar.displayName = 'TopBar';

const Layout: React.FC = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const { 
    sidebarCollapsed, 
    setSidebarCollapsed,
    stats,
    setStats,
    statsLoading,
    setStatsLoading,
    apiKeys
  } = useStore();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const { isConnected } = useWebSocket();

  const navigation = useMemo(() => [
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
  ], []);

  const toggleTheme = useCallback(() => {
    const newIsDark = !isDarkMode;
    setIsDarkMode(newIsDark);
    
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleLogout = useCallback(() => {
    logout();
    toast.success('Logged out successfully');
    window.location.href = '/login';
  }, [logout]);

  const getPageTitle = useCallback(() => {
    const path = location.pathname;
    switch (path) {
      case '/create': return 'Create API Key';
      case '/manage': return 'Manage Keys';
      case '/logs': return 'System Logs';
      default: return 'Dashboard';
    }
  }, [location.pathname]);

  const getPageDescription = useCallback(() => {
    const path = location.pathname;
    switch (path) {
      case '/create': return 'Generate new API keys with custom configuration';
      case '/manage': return 'View, edit, and manage your existing API keys';
      case '/logs': return 'Monitor system activity and troubleshoot issues';
      default: return 'Professional API key management system';
    }
  }, [location.pathname]);

  const getActiveKeysCount = useCallback(() => {
    const now = new Date();
    return apiKeys.filter(key => key.isActive && new Date(key.expiration) > now).length;
  }, [apiKeys]);

  const getExpiredKeysCount = useCallback(() => {
    const now = new Date();
    return apiKeys.filter(key => new Date(key.expiration) <= now).length;
  }, [apiKeys]);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        const response = await apiService.getHealth();
        setStats(response.stats);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [setStats, setStatsLoading]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        navigation={navigation}
        location={location}
        stats={stats}
        isStatsLoading={statsLoading}
        apiKeys={apiKeys}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        isConnected={isConnected}
        handleLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          pageTitle={getPageTitle()}
          pageDescription={getPageDescription()}
          apiKeys={apiKeys}
          getActiveKeysCount={getActiveKeysCount}
          getExpiredKeysCount={getExpiredKeysCount}
          setSidebarCollapsed={setSidebarCollapsed}
        />

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

export default memo(Layout);