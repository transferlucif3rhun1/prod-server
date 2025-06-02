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
  Eye,
  EyeOff,
  Plus,
  X
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
  const [actionMenuKey, setActionMenuKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Load keys on component mount
  useEffect(() => {
    fetchKeys();
  }, []);

  // Filter keys when dependencies change
  useEffect(() => {
    filterKeys();
  }, [apiKeys, searchTerm, filterStatus]);

  const fetchKeys = useCallback(async (useCache = true) => {
    try {
      setKeysLoading(true);
      setKeysError(null);
      
      const response = await apiService.getKeys({ limit: 1000 }, useCache);
      setApiKeys(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to fetch API keys';
      setKeysError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setKeysLoading(false);
    }
  }, [setApiKeys, setKeysLoading, setKeysError]);

  const filterKeys = useCallback(() => {
    let filtered = apiKeys;
    
    if (searchTerm) {
      filtered = filtered.filter(key =>
        key.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        key.id.toLowerCase().includes(searchTerm.toLowerCase())
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleEdit = (key: APIKey) => {
    setEditingKey(key);
    setShowEditModal(true);
    setActionMenuKey(null);
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await apiService.deleteKey(keyId);
      removeApiKey(keyId);
      toast.success('API key deleted successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete API key');
    }
    setActionMenuKey(null);
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedKeys.size} API key(s)? This action cannot be undone.`)) {
      return;
    }

    try {
      await Promise.all(Array.from(selectedKeys).map(keyId => apiService.deleteKey(keyId)));
      Array.from(selectedKeys).forEach(keyId => removeApiKey(keyId));
      setSelectedKeys(new Set());
      toast.success(`${selectedKeys.size} API key(s) deleted successfully`);
    } catch (error: any) {
      toast.error('Failed to delete some API keys');
    }
  };

  const handleCleanExpired = async () => {
    try {
      await apiService.cleanExpiredKeys();
      toast.success('Expired keys cleaned successfully');
      fetchKeys(false); // Force refresh
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to clean expired keys');
    }
  };

  const exportKeys = () => {
    const exportData = filteredKeys.map(key => ({
      name: key.name,
      maskedKey: key.maskedKey,
      expiration: key.expiration,
      rpm: key.rpm,
      threadsLimit: key.threadsLimit,
      totalRequests: key.totalRequests,
      usageCount: key.usageCount,
      isActive: key.isActive,
      createdAt: key.createdAt
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-keys-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('API keys exported successfully');
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
    if (selectedKeys.size === paginatedKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(paginatedKeys.map(key => key.id)));
    }
  };

  // Pagination
  const totalPages = Math.ceil(filteredKeys.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedKeys = filteredKeys.slice(startIndex, startIndex + itemsPerPage);

  // Loading State
  if (keysLoading && apiKeys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading API keys...</p>
      </div>
    );
  }

  // Error State
  if (keysError && apiKeys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
          <p className="text-red-800 dark:text-red-400 text-center">{keysError}</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={() => fetchKeys(false)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </motion.button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search keys..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 focus:ring-0 transition-colors"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 transition-colors"
          >
            <option value="all">All Keys</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="flex items-center space-x-3">
          <AnimatePresence>
            {selectedKeys.size > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedKeys.size})
              </motion.button>
            )}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={exportKeys}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={handleCleanExpired}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Clean Expired
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => fetchKeys(false)}
            disabled={keysLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${keysLoading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        {paginatedKeys.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0}
                        onChange={selectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Key Info
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Limits
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Expiration
                    </th>
                    <th className="relative px-6 py-4">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  <AnimatePresence>
                    {paginatedKeys.map((key, index) => {
                      const status = getKeyStatus(key);
                      const isSelected = selectedKeys.has(key.id);
                      
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
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleKeySelection(key.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-2">
                              <div className="flex items-center space-x-3">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {key.name || 'Untitled'}
                                </span>
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => copyToClipboard(key.id)}
                                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                  <Copy className="w-4 h-4" />
                                </motion.button>
                              </div>
                              <code className="text-xs text-gray-500 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {key.maskedKey}
                              </code>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-1">
                                <Zap className="w-3 h-3 text-yellow-500" />
                                <span>{key.rpm} RPM</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Users className="w-3 h-3 text-blue-500" />
                                <span>{key.threadsLimit} threads</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                            <div className="space-y-1">
                              <div>{key.usageCount.toLocaleString()} used</div>
                              <div className="text-xs">of {key.totalRequests.toLocaleString()}</div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                <div 
                                  className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                                  style={{ 
                                    width: `${Math.min((key.usageCount / key.totalRequests) * 100, 100)}%` 
                                  }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3" />
                              <span>{format(new Date(key.expiration), 'MMM dd, yyyy')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium">
                            <div className="relative">
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                onClick={() => setActionMenuKey(actionMenuKey === key.id ? null : key.id)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </motion.button>

                              <AnimatePresence>
                                {actionMenuKey === key.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-2"
                                  >
                                    <button
                                      onClick={() => handleEdit(key)}
                                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                      <Edit3 className="w-4 h-4 mr-3" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => copyToClipboard(key.id)}
                                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                      <Copy className="w-4 h-4 mr-3" />
                                      Copy Key
                                    </button>
                                    <button
                                      onClick={() => handleDelete(key.id)}
                                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4 mr-3" />
                                      Delete
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                      <span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredKeys.length)}</span> of{' '}
                      <span className="font-medium">{filteredKeys.length}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === currentPage
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          } ${page === 1 ? 'rounded-l-md' : ''} ${page === totalPages ? 'rounded-r-md' : ''}`}
                        >
                          {page}
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
              {searchTerm || filterStatus !== 'all' ? 'No keys match your filters' : 'No API keys found'}
            </div>
            {(!searchTerm && filterStatus === 'all') && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => window.location.href = '/create'}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2 inline" />
                Create your first API key
              </motion.button>
            )}
          </div>
        )}
      </motion.div>

      {filteredKeys.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {filteredKeys.length} of {apiKeys.length} API keys
        </div>
      )}
    </div>
  );
};

export default ManageKeys;