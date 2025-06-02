import React, { useState, useEffect } from 'react';
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
  Eye,
  EyeOff,
  Calendar,
  Activity,
  Users,
  Zap
} from 'lucide-react';
import { APIKey, UpdateKeyRequest } from '../types';
import apiService from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ManageKeys: React.FC = () => {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [filteredKeys, setFilteredKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionMenuKey, setActionMenuKey] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  useEffect(() => {
    filterKeys();
  }, [keys, searchTerm, filterStatus]);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const response = await apiService.getKeys({ limit: 1000 });
      setKeys(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };

  const filterKeys = () => {
    let filtered = keys;
    
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
  };

  const getKeyStatus = (key: APIKey) => {
    const now = new Date();
    const expirationDate = new Date(key.expiration);
    
    if (!key.isActive) return 'inactive';
    if (expirationDate <= now) return 'expired';
    return 'active';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'status-active';
      case 'expired': return 'status-expired';
      case 'inactive': return 'status-inactive';
      default: return 'status-inactive';
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
      toast.success('API key deleted successfully');
      fetchKeys();
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
      toast.success(`${selectedKeys.size} API key(s) deleted successfully`);
      setSelectedKeys(new Set());
      fetchKeys();
    } catch (error: any) {
      toast.error('Failed to delete some API keys');
    }
  };

  const handleCleanExpired = async () => {
    try {
      await apiService.cleanExpiredKeys();
      toast.success('Expired keys cleaned successfully');
      fetchKeys();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to clean expired keys');
    }
  };

  const exportKeys = () => {
    const exportData = keys.map(key => ({
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
    if (selectedKeys.size === filteredKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredKeys.map(key => key.id)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search keys..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">All Keys</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          {selectedKeys.size > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleBulkDelete}
              className="btn-danger"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete ({selectedKeys.size})
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={exportKeys}
            className="btn-secondary"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={handleCleanExpired}
            className="btn-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Clean Expired
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={fetchKeys}
            className="btn-primary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </motion.button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedKeys.size === filteredKeys.length && filteredKeys.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Key Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Limits
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Expiration
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <AnimatePresence>
                {filteredKeys.map((key, index) => {
                  const status = getKeyStatus(key);
                  const isSelected = selectedKeys.has(key.id);
                  
                  return (
                    <motion.tr
                      key={key.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.05 }}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleKeySelection(key.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {key.name || 'Untitled'}
                            </span>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => copyToClipboard(key.id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              <Copy className="w-4 h-4" />
                            </motion.button>
                          </div>
                          <code className="text-xs text-gray-500 font-mono">
                            {key.maskedKey}
                          </code>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1">
                            <Zap className="w-3 h-3" />
                            <span>{key.rpm} RPM</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Users className="w-3 h-3" />
                            <span>{key.threadsLimit} threads</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <div className="space-y-1">
                          <div>{key.usageCount.toLocaleString()} used</div>
                          <div>of {key.totalRequests.toLocaleString()}</div>
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
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </motion.button>

                          <AnimatePresence>
                            {actionMenuKey === key.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10"
                              >
                                <div className="py-1">
                                  <button
                                    onClick={() => handleEdit(key)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Edit3 className="w-4 h-4 mr-2" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => copyToClipboard(key.id)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Key
                                  </button>
                                  <button
                                    onClick={() => handleDelete(key.id)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </button>
                                </div>
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

        {filteredKeys.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
              {searchTerm || filterStatus !== 'all' ? 'No keys match your filters' : 'No API keys found'}
            </div>
          </div>
        )}
      </motion.div>

      {filteredKeys.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredKeys.length} of {keys.length} API keys
        </div>
      )}
    </div>
  );
};

export default ManageKeys;