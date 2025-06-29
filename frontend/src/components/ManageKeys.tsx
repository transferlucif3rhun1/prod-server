import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
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
  Plus,
  X,
  Clock,
  Grid,
  List
} from 'lucide-react';
import { APIKey, UpdateKeyRequest } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import { copyToClipboard } from '../utils';
import { LoadingSpinner, ErrorDisplay, ActionButton, StatusBadge, EmptyState, formatValue, formatUsageDisplay } from './shared';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface EditFormData {
  name: string;
  rpm: number;
  threadsLimit: number;
  totalRequests: number;
  isActive: boolean;
}

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
  const [editForm, setEditForm] = useState<EditFormData>({
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
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);

  const getKeyStatus = useCallback((key: APIKey): 'active' | 'expired' | 'inactive' => {
    const now = new Date();
    const expirationDate = new Date(key.expiration);
    
    if (!key.isActive) return 'inactive';
    if (expirationDate <= now) return 'expired';
    return 'active';
  }, []);

  useEffect(() => {
    fetchKeys();
  }, []);

  useEffect(() => {
    filterKeys();
  }, [apiKeys, searchTerm, filterStatus, getKeyStatus]);

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
    } catch (error: unknown) {
      setRetryAttempts(prev => prev + 1);
      
      const errorMessage = error instanceof Error ? error.message : 'Unable to load API keys. Please try again.';
      setKeysError(errorMessage);
      
      if (retryAttempts < 3) {
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
      filtered = filtered.filter(key => getKeyStatus(key) === filterStatus);
    }

    setFilteredKeys(filtered);
    setCurrentPage(1);
  }, [apiKeys, searchTerm, filterStatus, getKeyStatus]);

  const getStatusColor = useCallback((status: string): string => {
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
  }, []);

  const handleCopyToClipboard = useCallback(async (text: string, keyId: string) => {
    try {
      const success = await copyToClipboard(text);
      if (success) {
        setCopyStates(prev => ({ ...prev, [keyId]: true }));
        toast.success('API key copied to clipboard!');
        setTimeout(() => {
          setCopyStates(prev => ({ ...prev, [keyId]: false }));
        }, 2000);
      } else {
        toast.error('Failed to copy to clipboard. Please try selecting and copying manually.');
      }
    } catch {
      toast.error('Failed to copy to clipboard. Please try selecting and copying manually.');
    }
  }, []);

  const handleEdit = useCallback((key: APIKey) => {
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
  }, []);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;

    setEditLoading(true);
    try {
      const updateData: UpdateKeyRequest = Object.entries(editForm).reduce((acc, [key, value]) => {
        if (value !== editingKey[key as keyof APIKey]) {
          (acc as Record<string, unknown>)[key] = value;
        }
        return acc;
      }, {} as UpdateKeyRequest);

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes detected');
        setShowEditModal(false);
        return;
      }

      const response = await apiService.updateKey(editingKey.id, updateData);
      updateApiKey(response.data);
      toast.success('API key updated successfully');
      setShowEditModal(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update API key';
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

  const handleDelete = useCallback(async (keyId: string, keyName?: string) => {
    const displayName = keyName || 'this API key';
    if (!confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await apiService.deleteKey(keyId);
      removeApiKey(keyId);
      toast.success(`API key "${displayName}" deleted successfully`);
    } catch (error: unknown) {
      let errorMessage = 'Failed to delete API key. Please try again.';
      
      if (error instanceof Error) {
        if (error.message?.includes('500')) {
          errorMessage = 'Server error occurred. Please try again in a moment.';
        } else if (error.message?.includes('404')) {
          errorMessage = 'API key not found. It may have already been deleted.';
          fetchKeys(false);
        }
      }
      
      toast.error(errorMessage);
    }
    setActionMenuKey(null);
  }, [removeApiKey, fetchKeys]);

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
          } catch {
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
    } catch {
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clean expired keys. Please try again.';
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

  const toggleKeySelection = useCallback((keyId: string) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(keyId)) {
      newSelected.delete(keyId);
    } else {
      newSelected.add(keyId);
    }
    setSelectedKeys(newSelected);
  }, [selectedKeys, setSelectedKeys]);

  const selectAll = useCallback(() => {
    if (selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(paginatedKeys.map(key => key.id)));
    }
  }, [selectedKeys, setSelectedKeys]);

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

  const totalPages = Math.ceil(filteredKeys.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedKeys = filteredKeys.slice(startIndex, startIndex + itemsPerPage);

  if (keysLoading && (!apiKeys || apiKeys.length === 0)) {
    return <LoadingSpinner message="Loading your API keys..." />;
  }

  if (keysError && (!apiKeys || apiKeys.length === 0)) {
    return (
      <ErrorDisplay
        title="Unable to Load API Keys"
        message={keysError}
        showOfflineIndicator={offlineMode}
        onRetry={() => fetchKeys(false)}
        retryLabel="Try Again"
      />
    );
  }

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

          <ActionButton
            onClick={exportKeys}
            disabled={filteredKeys.length === 0}
            variant="secondary"
            size="sm"
            icon={Download}
          >
            Export
          </ActionButton>

          <ActionButton
            onClick={handleCleanExpired}
            disabled={getExpiredKeysCount() === 0}
            variant="secondary"
            size="sm"
            icon={RefreshCw}
          >
            Clean Expired
          </ActionButton>

          <ActionButton
            onClick={() => fetchKeys(false)}
            disabled={keysLoading}
            variant="primary"
            size="sm"
            icon={RefreshCw}
            loading={keysLoading}
          >
            Refresh
          </ActionButton>
        </div>
      </div>

      {paginatedKeys.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6">
            <div className="grid gap-4">
              {paginatedKeys.map((key) => {
                const usageDisplay = formatUsageDisplay(Number(key.usageCount), Number(key.totalRequests));
                
                return (
                <motion.div
                  key={key.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key.id)}
                        onChange={() => toggleKeySelection(key.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {key.name || 'Untitled Key'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {key.maskedKey}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={getKeyStatus(key) as 'active' | 'expired' | 'inactive'}>
                        {getKeyStatus(key)}
                      </StatusBadge>
                      <div className="action-menu-container relative">
                        <button
                          onClick={() => setActionMenuKey(actionMenuKey === key.id ? null : key.id)}
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {actionMenuKey === key.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[150px]">
                            <button
                              onClick={() => handleCopyToClipboard(key.id, key.id)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                            >
                              {copyStates[key.id] ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              <span>Copy Key</span>
                            </button>
                            <button
                              onClick={() => handleEdit(key)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                            >
                              <Edit3 className="w-4 h-4" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(key.id, key.name)}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-gray-600 dark:text-gray-400">RPM:</span>
                      <span className="font-medium">{formatValue(key.rpm)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="text-gray-600 dark:text-gray-400">Threads:</span>
                      <span className="font-medium">{formatValue(key.threadsLimit)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-green-500" />
                      <span className="text-gray-600 dark:text-gray-400">Usage:</span>
                      <span className="font-medium" title={usageDisplay.subtext}>
                        {usageDisplay.text}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-purple-500" />
                      <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                      <span className="font-medium">{format(new Date(key.expiration), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                  {!usageDisplay.isUnlimited && usageDisplay.percentage !== null && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${usageDisplay.percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>Usage: {usageDisplay.subtext}</span>
                        <Clock className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </motion.div>
              )})}
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={selectAll}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title={searchTerm || filterStatus !== 'all' ? 'No keys match your filters' : 'No API keys found'}
          description={searchTerm || filterStatus !== 'all' ? 'Try adjusting your search or filter criteria' : 'Create your first API key to get started'}
          actionLabel={(!searchTerm && filterStatus === 'all') ? 'Create your first API key' : undefined}
          onAction={(!searchTerm && filterStatus === 'all') ? () => window.location.href = '/create' : undefined}
          icon={Plus}
        />
      )}
    </div>
  );
};

export default ManageKeys;