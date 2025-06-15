import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  CheckCircle,
  RefreshCw,
  Download,
  Calendar,
  Activity,
  Users,
  Zap,
  AlertCircle,
  Plus,
  X,
  Clock,
  Grid,
  List,
  Infinity,
  WifiOff,
  AlertTriangle
} from 'lucide-react';
import { APIKey, UpdateKeyRequest } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ManageKeys: React.FC = () => {
  const { 
    apiKeys, 
    selectedKeys, 
    keysLoading, 
    keysError,
    setApiKeys, 
    setSelectedKeys, 
    updateApiKey, 
    removeApiKey,
    setKeysLoading,
    setKeysError
  } = useStore();

  const [filteredKeys, setFilteredKeys] = useState<APIKey[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    rpm: 0,
    threadsLimit: 0,
    totalRequests: 0,
    isActive: true
  });
  const [editLoading, setEditLoading] = useState(false);
  const [actionMenuKey, setActionMenuKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [copyStates, setCopyStates] = useState<{[key: string]: boolean}>({});
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  useEffect(() => {
    filterKeys();
  }, [apiKeys, searchTerm, filterStatus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.action-menu-container')) {
        setActionMenuKey(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false);
      if (retryAttempts > 0) {
        fetchKeys(false);
      }
    };

    const handleOffline = () => {
      setOfflineMode(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [retryAttempts]);

  const fetchKeys = useCallback(async (useCache = true) => {
    try {
      setKeysLoading(true);
      setKeysError(null);
      setRetryAttempts(0);
      
      const response = await apiService.getKeys({ limit: 1000 }, useCache);
      setApiKeys(response.data || []);
      
      if ((response.data || []).length === 0 && !useCache) {
        toast.info('No API keys found. Create your first key to get started.');
      }
    } catch (error: any) {
      setRetryAttempts(prev => prev + 1);
      
      let errorMessage = 'Unable to load API keys. Please try again.';
      let showRetry = true;
      
      if (error.message?.includes('Network error') || error.message?.includes('timeout')) {
        errorMessage = 'Network connection problem. Check your internet connection.';
        setOfflineMode(true);
      } else if (error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
        errorMessage = 'Server error detected. The issue has been logged and will be resolved shortly.';
      } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        errorMessage = 'Session expired. Please log in again.';
        showRetry = false;
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
      
      setKeysError(errorMessage);
      
      if (showRetry && retryAttempts < 3) {
        toast.error(`${errorMessage} Retrying...`);
        setTimeout(() => fetchKeys(false), Math.min(1000 * (retryAttempts + 1), 5000));
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setKeysLoading(false);
    }
  }, [setApiKeys, setKeysLoading, setKeysError, retryAttempts]);

  const filterKeys = useCallback(() => {
    const safeApiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    let filtered = [...safeApiKeys];
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(key =>
        (key.name?.toLowerCase().includes(searchLower)) ||
        key.id.toLowerCase().includes(searchLower) ||
        key.maskedKey?.toLowerCase().includes(searchLower)
      );
    }

    if (filterStatus !== 'all') {
      const now = new Date();
      filtered = filtered.filter(key => {
        switch (filterStatus) {
          case 'active':
            return key.isActive && new Date(key.expiration) > now;
          case 'expired':
            return new Date(key.expiration) <= now;
          case 'inactive':
            return !key.isActive;
          default:
            return true;
        }
      });
    }

    setFilteredKeys(filtered);
    setCurrentPage(1);
  }, [apiKeys, searchTerm, filterStatus]);

  const getKeyStatus = (key: APIKey) => {
    const now = new Date();
    const expirationDate = new Date(key.expiration);
    
    if (!key.isActive) return 'inactive';
    if (expirationDate <= now) return 'expired';
    return 'active';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': 
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'expired': 
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'inactive': 
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: 
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const formatValue = (value: number, type: 'rpm' | 'threads' | 'requests' = 'requests'): string => {
    if (value === 0) {
      return 'Unlimited';
    }
    return value.toLocaleString();
  };

  const copyToClipboard = async (text: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStates(prev => ({ ...prev, [keyId]: true }));
      toast.success('API key copied to clipboard!');
      setTimeout(() => {
        setCopyStates(prev => ({ ...prev, [keyId]: false }));
      }, 2000);
    } catch {
      toast.error('Failed to copy to clipboard. Please try selecting and copying manually.');
    }
  };

  const handleEdit = (key: APIKey) => {
    setEditingKey(key);
    setEditForm({
      name: key.name || '',
      rpm: key.rpm,
      threadsLimit: key.threadsLimit,
      totalRequests: key.totalRequests,
      isActive: key.isActive
    });
    setShowEditModal(true);
    setActionMenuKey(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;

    setEditLoading(true);
    try {
      const updateData: UpdateKeyRequest = {};
      
      if (editForm.name !== editingKey.name) {
        updateData.name = editForm.name;
      }
      if (editForm.rpm !== editingKey.rpm) {
        updateData.rpm = editForm.rpm;
      }
      if (editForm.threadsLimit !== editingKey.threadsLimit) {
        updateData.threadsLimit = editForm.threadsLimit;
      }
      if (editForm.totalRequests !== editingKey.totalRequests) {
        updateData.totalRequests = editForm.totalRequests;
      }
      if (editForm.isActive !== editingKey.isActive) {
        updateData.isActive = editForm.isActive;
      }

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes detected');
        setShowEditModal(false);
        return;
      }

      const response = await apiService.updateKey(editingKey.id, updateData);
      updateApiKey(response.data);
      toast.success('API key updated successfully');
      setShowEditModal(false);
    } catch (error: any) {
      let errorMessage = 'Failed to update API key';
      
      if (error.message?.includes('500')) {
        errorMessage = 'Server error occurred. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'API key not found. It may have been deleted.';
        fetchKeys(false);
      } else if (error.message?.includes('validation')) {
        errorMessage = 'Invalid input data. Please check your values.';
      }
      
      toast.error(errorMessage);
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
    setEditingKey(null);
    setEditForm({
      name: '',
      rpm: 0,
      threadsLimit: 0,
      totalRequests: 0,
      isActive: true
    });
  };

  const handleDelete = async (keyId: string, keyName?: string) => {
    const displayName = keyName || 'this API key';
    if (!confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await apiService.deleteKey(keyId);
      removeApiKey(keyId);
      toast.success(`API key "${displayName}" deleted successfully`);
    } catch (error: any) {
      let errorMessage = 'Failed to delete API key. Please try again.';
      
      if (error.message?.includes('500')) {
        errorMessage = 'Server error occurred. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'API key not found. It may have already been deleted.';
        fetchKeys(false);
      }
      
      toast.error(errorMessage);
    }
    setActionMenuKey(null);
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    
    const keyCount = selectedKeys.size;
    if (!confirm(`Are you sure you want to delete ${keyCount} API key(s)? This action cannot be undone.`)) {
      return;
    }

    const successKeys: string[] = [];
    const failedKeys: string[] = [];

    try {
      await Promise.allSettled(
        Array.from(selectedKeys).map(async (keyId) => {
          try {
            await apiService.deleteKey(keyId);
            removeApiKey(keyId);
            successKeys.push(keyId);
          } catch (error) {
            failedKeys.push(keyId);
          }
        })
      );

      setSelectedKeys(new Set());

      if (successKeys.length > 0) {
        toast.success(`Successfully deleted ${successKeys.length} API key(s)`);
      }
      if (failedKeys.length > 0) {
        toast.error(`Failed to delete ${failedKeys.length} API key(s). Please try again.`);
      }
    } catch (error) {
      toast.error('Bulk delete operation failed. Please try again.');
    }
  };

  const handleCleanExpired = async () => {
    const expiredCount = getExpiredKeysCount();
    if (expiredCount === 0) {
      toast.info('No expired keys found to clean up.');
      return;
    }

    if (!confirm(`This will permanently delete ${expiredCount} expired API key(s). Continue?`)) {
      return;
    }

    try {
      const response = await apiService.cleanExpiredKeys();
      toast.success(response.message || 'Expired keys cleaned successfully');
      fetchKeys(false);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to clean expired keys. Please try again.';
      toast.error(errorMessage);
    }
  };

  const exportKeys = () => {
    if (filteredKeys.length === 0) {
      toast.error('No API keys to export');
      return;
    }

    const exportData = filteredKeys.map(key => ({
      name: key.name,
      maskedKey: key.maskedKey,
      expiration: key.expiration,
      rpm: key.rpm,
      threadsLimit: key.threadsLimit,
      totalRequests: key.totalRequests,
      usageCount: key.usageCount,
      isActive: key.isActive,
      createdAt: key.createdAt,
      status: getKeyStatus(key)
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-keys-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredKeys.length} API keys`);
  };

  const toggleKeySelection = (keyId: string) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(keyId)) {
      newSelected.delete(keyId);
    } else {
      newSelected.add(keyId);
    }
    setSelectedKeys(newSelected);
  };

  const selectAll = () => {
    if (selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(paginatedKeys.map(key => key.id)));
    }
  };

  const getActiveKeysCount = () => {
    const now = new Date();
    const safeApiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    return safeApiKeys.filter(key => key.isActive && new Date(key.expiration) > now).length;
  };

  const getExpiredKeysCount = () => {
    const now = new Date();
    const safeApiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    return safeApiKeys.filter(key => new Date(key.expiration) <= now).length;
  };

  const calculateUsagePercentage = (used: number, total: number) => {
    if (total === 0) return 0;
    return Math.min((used / total) * 100, 100);
  };

  const formatUsageDisplay = (used: number, total: number) => {
    if (total === 0) {
      return {
        text: `${used.toLocaleString()} used`,
        subtext: 'Unlimited available',
        percentage: null,
        isUnlimited: true
      };
    }
    
    const percentage = calculateUsagePercentage(used, total);
    return {
      text: `${used.toLocaleString()}/${total.toLocaleString()}`,
      subtext: `${percentage.toFixed(1)}% used`,
      percentage: percentage,
      isUnlimited: false
    };
  };

  const totalPages = Math.ceil(filteredKeys.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedKeys = filteredKeys.slice(startIndex, startIndex + itemsPerPage);

  if (keysLoading && (!apiKeys || apiKeys.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading your API keys...</p>
        {retryAttempts > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Retry attempt {retryAttempts}/3
          </p>
        )}
      </div>
    );
  }

  if (keysError && (!apiKeys || apiKeys.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg text-center max-w-md">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
          <p className="text-red-800 dark:text-red-400 font-medium">Unable to Load API Keys</p>
          <p className="text-red-600 dark:text-red-500 text-sm mt-1">{keysError}</p>
          {offlineMode && (
            <div className="flex items-center justify-center mt-2 text-sm text-gray-600 dark:text-gray-400">
              <WifiOff className="w-4 h-4 mr-1" />
              <span>You appear to be offline</span>
            </div>
          )}
        </div>
        <div className="flex space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fetchKeys(false)}
            disabled={keysLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${keysLoading ? 'animate-spin' : ''}`} />
            <span>Try Again</span>
          </motion.button>
          {retryAttempts > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/create'}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Key</span>
            </motion.button>
          )}
        </div>
      </div>
    );
  }

  const renderTableView = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
      <div className="w-full">
        <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-4 text-left w-12">
                <input
                  type="checkbox"
                  checked={selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0}
                  onChange={selectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Key Information
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Rate Limits
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Usage Progress
              </th>
              <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Expiration
              </th>
              <th className="relative px-4 py-4 w-16">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            <AnimatePresence>
              {paginatedKeys.map((key, index) => {
                const status = getKeyStatus(key);
                const isSelected = selectedKeys.has(key.id);
                const usagePercentage = calculateUsagePercentage(key.usageCount, key.totalRequests);
                const isExpiringSoon = new Date(key.expiration).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                
                return (
                  <motion.tr
                    key={key.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleKeySelection(key.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-3">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {key.name || 'Untitled Key'}
                          </span>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => copyToClipboard(key.id, key.id)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="Copy full API key"
                          >
                            {copyStates[key.id] ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </motion.button>
                        </div>
                        <code className="text-xs text-gray-500 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {key.maskedKey || maskAPIKey(key.id)}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                        {status === 'active' && <Activity className="w-3 h-3 mr-1" />}
                        {status === 'expired' && <Clock className="w-3 h-3 mr-1" />}
                        {status === 'inactive' && <X className="w-3 h-3 mr-1" />}
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                      {status === 'active' && isExpiringSoon && (
                        <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Expires soon
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-1">
                          {key.rpm === 0 ? (
                            <Infinity className="w-3 h-3 text-blue-500" />
                          ) : (
                            <Zap className="w-3 h-3 text-yellow-500" />
                          )}
                          <span>{formatValue(key.rpm, 'rpm')} RPM</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {key.threadsLimit === 0 ? (
                            <Infinity className="w-3 h-3 text-blue-500" />
                          ) : (
                            <Users className="w-3 h-3 text-blue-500" />
                          )}
                          <span>{formatValue(key.threadsLimit, 'threads')} threads</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="space-y-2">
                        {(() => {
                          const usage = formatUsageDisplay(key.usageCount, key.totalRequests);
                          return (
                            <>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {usage.text}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {usage.subtext}
                              </div>
                              {!usage.isUnlimited && usage.percentage !== null && (
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                      usage.percentage >= 90 ? 'bg-red-500' :
                                      usage.percentage >= 75 ? 'bg-yellow-500' :
                                      'bg-blue-500'
                                    }`}
                                    style={{ width: `${usage.percentage}%` }}
                                  ></div>
                                </div>
                              )}
                              {usage.isUnlimited && (
                                <div className="flex items-center text-xs text-blue-600 dark:text-blue-400">
                                  <Infinity className="w-3 h-3 mr-1" />
                                  No limits applied
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(key.expiration), 'MMM dd, yyyy')}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {format(new Date(key.expiration), 'HH:mm')}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-medium">
                      <div className="relative action-menu-container">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuKey(actionMenuKey === key.id ? null : key.id);
                          }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </motion.button>

                        <AnimatePresence>
                          {actionMenuKey === key.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleEdit(key)}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <Edit3 className="w-4 h-4 mr-3" />
                                Edit Key
                              </button>
                              <button
                                onClick={() => copyToClipboard(key.id, key.id)}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <Copy className="w-4 h-4 mr-3" />
                                Copy Full Key
                              </button>
                              <button
                                onClick={() => handleDelete(key.id, key.name)}
                                className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <Trash2 className="w-4 h-4 mr-3" />
                                Delete Key
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderCardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <AnimatePresence>
        {paginatedKeys.map((key, index) => {
          const status = getKeyStatus(key);
          const isSelected = selectedKeys.has(key.id);
          const usagePercentage = calculateUsagePercentage(key.usageCount, key.totalRequests);
          const isExpiringSoon = new Date(key.expiration).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
          
          return (
            <motion.div
              key={key.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 transition-all duration-200 hover:shadow-xl ${
                isSelected ? 'border-blue-500 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleKeySelection(key.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {key.name || 'Untitled Key'}
                        </h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                          {status === 'active' && <Activity className="w-3 h-3 mr-1" />}
                          {status === 'expired' && <Clock className="w-3 h-3 mr-1" />}
                          {status === 'inactive' && <X className="w-3 h-3 mr-1" />}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                        {status === 'active' && isExpiringSoon && (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20 px-2 py-0.5 rounded flex items-center">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Expires soon
                          </span>
                        )}
                      </div>
                      <code className="text-xs text-gray-500 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {key.maskedKey || maskAPIKey(key.id)}
                      </code>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => copyToClipboard(key.id, key.id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                      title="Copy full API key"
                    >
                      {copyStates[key.id] ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </motion.button>
                    
                    <div className="relative action-menu-container">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenuKey(actionMenuKey === key.id ? null : key.id);
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </motion.button>

                      <AnimatePresence>
                        {actionMenuKey === key.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleEdit(key)}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Edit3 className="w-4 h-4 mr-3" />
                              Edit Key
                            </button>
                            <button
                              onClick={() => copyToClipboard(key.id, key.id)}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Copy className="w-4 h-4 mr-3" />
                              Copy Full Key
                            </button>
                            <button
                              onClick={() => handleDelete(key.id, key.name)}
                              className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Trash2 className="w-4 h-4 mr-3" />
                              Delete Key
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                  <div>
                    <div className="flex items-center justify-center space-x-1 text-yellow-500 mb-1">
                      {key.rpm === 0 ? (
                        <Infinity className="w-3 h-3" />
                      ) : (
                        <Zap className="w-3 h-3" />
                      )}
                      <span className="text-xs font-medium">RPM</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatValue(key.rpm, 'rpm')}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center space-x-1 text-blue-500 mb-1">
                      {key.threadsLimit === 0 ? (
                        <Infinity className="w-3 h-3" />
                      ) : (
                        <Users className="w-3 h-3" />
                      )}
                      <span className="text-xs font-medium">Threads</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatValue(key.threadsLimit, 'threads')}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center space-x-1 text-gray-500 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span className="text-xs font-medium">Expires</span>
                    </div>
                    <div className="text-xs font-medium text-gray-900 dark:text-white">
                      {format(new Date(key.expiration), 'MMM dd')}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  {(() => {
                    const usage = formatUsageDisplay(key.usageCount, key.totalRequests);
                    return (
                      <>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Usage</span>
                          <span className="text-xs font-medium text-gray-900 dark:text-white">
                            {usage.text}
                          </span>
                        </div>
                        {!usage.isUnlimited && usage.percentage !== null ? (
                          <>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-1">
                              <div 
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  usage.percentage >= 90 ? 'bg-red-500' :
                                  usage.percentage >= 75 ? 'bg-yellow-500' :
                                  'bg-blue-500'
                                }`}
                                style={{ width: `${usage.percentage}%` }}
                              ></div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                              {usage.subtext}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center text-xs text-blue-600 dark:text-blue-400">
                            <Infinity className="w-3 h-3 mr-1" />
                            {usage.subtext}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {showEditModal && editingKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={handleEditCancel}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Edit API Key
                </h3>
                <button
                  onClick={handleEditCancel}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="API Key Name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      RPM (0 = Unlimited)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={editForm.rpm}
                      onChange={(e) => setEditForm(prev => ({ ...prev, rpm: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Threads (0 = Unlimited)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={editForm.threadsLimit}
                      onChange={(e) => setEditForm(prev => ({ ...prev, threadsLimit: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Total Requests (0 = Unlimited)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.totalRequests}
                    onChange={(e) => setEditForm(prev => ({ ...prev, totalRequests: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Active
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleEditCancel}
                    className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center justify-center"
                  >
                    {editLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Key'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {offlineMode && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4"
        >
          <div className="flex items-center space-x-3">
            <WifiOff className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="text-yellow-800 dark:text-yellow-400 font-medium">You're currently offline</p>
              <p className="text-yellow-600 dark:text-yellow-500 text-sm">Some features may not be available. Changes will sync when you're back online.</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, key, or masked key..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 focus:ring-0 transition-colors text-sm"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 transition-colors text-sm min-w-[140px]"
          >
            <option value="all">All Keys ({(Array.isArray(apiKeys) ? apiKeys : []).length})</option>
            <option value="active">Active ({getActiveKeysCount()})</option>
            <option value="expired">Expired ({getExpiredKeysCount()})</option>
            <option value="inactive">Inactive ({(Array.isArray(apiKeys) ? apiKeys : []).filter(k => !k.isActive).length})</option>
          </select>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {selectedKeys.size > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete ({selectedKeys.size})</span>
              </motion.button>
            )}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={exportKeys}
            disabled={filteredKeys.length === 0}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCleanExpired}
            disabled={getExpiredKeysCount() === 0}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Clean Expired</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fetchKeys(false)}
            disabled={keysLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${keysLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </motion.button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {paginatedKeys.length > 0 ? (
          <>
            {viewMode === 'table' ? renderTableView() : renderCardView()}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredKeys.length)}</span> of{' '}
                  <span className="font-medium">{filteredKeys.length}</span> results
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <div className="space-y-4">
              <div className="text-gray-500 dark:text-gray-400">
                {searchTerm || filterStatus !== 'all' ? (
                  <div>
                    <p className="text-lg font-medium mb-2">No keys match your filters</p>
                    <p className="text-sm">Try adjusting your search or filter criteria</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-medium mb-2">No API keys found</p>
                    <p className="text-sm">Create your first API key to get started</p>
                  </div>
                )}
              </div>
              {(!searchTerm && filterStatus === 'all') && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => window.location.href = '/create'}
                  className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create your first API key</span>
                </motion.button>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {filteredKeys.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Displaying {filteredKeys.length} of {Array.isArray(apiKeys) ? apiKeys.length : 0} total API keys
        </div>
      )}
    </div>
  );
};

function maskAPIKey(key: string): string {
  if (key.length <= 8) {
    return '*'.repeat(key.length);
  }
  return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
}

export default ManageKeys;