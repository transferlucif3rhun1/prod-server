import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MoreVertical, Edit3, Trash2, RefreshCw, Download,
  Calendar, Activity, Users, Zap, Plus, Grid, List, Filter
} from 'lucide-react';
import { APIKey, UpdateKeyRequest } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import { 
  LoadingSpinner, 
  ErrorDisplay, 
  ActionButton, 
  StatusBadge, 
  EmptyState, 
  CopyButton,
  Modal,
  FormInput,
  formatValue,
  formatUsageDisplay
} from './shared';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface EditFormData {
  name: string;
  rpm: number;
  threadsLimit: number;
  totalRequests: number;
  isActive: boolean;
}

type ViewMode = 'table' | 'cards';
type KeyStatus = 'active' | 'expired' | 'inactive';

// Filter and search component
const FilterControls: React.FC<{
  searchTerm: string;
  filterStatus: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  totalCounts: { total: number; active: number; expired: number; inactive: number };
}> = ({ 
  searchTerm, 
  filterStatus, 
  onSearchChange, 
  onFilterChange, 
  viewMode, 
  onViewModeChange,
  totalCounts 
}) => (
  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search by name, key, or masked key..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 focus:ring-0 transition-colors text-sm"
        />
      </div>

      <select
        value={filterStatus}
        onChange={(e) => onFilterChange(e.target.value)}
        className="px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 transition-colors text-sm min-w-[140px]"
      >
        <option value="all">All Keys ({totalCounts.total})</option>
        <option value="active">Active ({totalCounts.active})</option>
        <option value="expired">Expired ({totalCounts.expired})</option>
        <option value="inactive">Inactive ({totalCounts.inactive})</option>
      </select>
    </div>

    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => onViewModeChange('table')}
        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'table'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => onViewModeChange('cards')}
        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'cards'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <Grid className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// Action menu component
const ActionMenu: React.FC<{
  keyId: string;
  keyName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  isOpen: boolean;
  onClose: () => void;
}> = ({ keyId, keyName, onEdit, onDelete, onCopy, isOpen, onClose }) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`[data-menu="${keyId}"]`)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen, keyId, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[150px]"
      data-menu={keyId}
    >
      <button
        onClick={onCopy}
        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 rounded-t-lg"
      >
        <span>Copy Key</span>
      </button>
      <button
        onClick={onEdit}
        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
      >
        <Edit3 className="w-4 h-4" />
        <span>Edit</span>
      </button>
      <button
        onClick={onDelete}
        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2 rounded-b-lg"
      >
        <Trash2 className="w-4 h-4" />
        <span>Delete</span>
      </button>
    </motion.div>
  );
};

// Key card component
const KeyCard: React.FC<{
  apiKey: APIKey;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  getKeyStatus: (key: APIKey) => KeyStatus;
}> = ({ apiKey, isSelected, onSelect, onEdit, onDelete, onCopy, getKeyStatus }) => {
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [copyState, setCopyState] = useState(false);
  
  const usageDisplay = useMemo(() => 
    formatUsageDisplay(Number(apiKey.usageCount), Number(apiKey.totalRequests)), 
    [apiKey.usageCount, apiKey.totalRequests]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey.id);
      setCopyState(true);
      onCopy();
      setTimeout(() => setCopyState(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [apiKey.id, onCopy]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {apiKey.name || 'Untitled Key'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {apiKey.maskedKey}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status={getKeyStatus(apiKey)}>
            {getKeyStatus(apiKey)}
          </StatusBadge>
          <div className="relative">
            <button
              onClick={() => setShowActionMenu(!showActionMenu)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <ActionMenu
              keyId={apiKey.id}
              keyName={apiKey.name}
              onEdit={onEdit}
              onDelete={onDelete}
              onCopy={handleCopy}
              isOpen={showActionMenu}
              onClose={() => setShowActionMenu(false)}
            />
          </div>
        </div>
      </div>
      
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span className="text-gray-600 dark:text-gray-400">RPM:</span>
          <span className="font-medium">{formatValue(apiKey.rpm)}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-blue-500" />
          <span className="text-gray-600 dark:text-gray-400">Threads:</span>
          <span className="font-medium">{formatValue(apiKey.threadsLimit)}</span>
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
          <span className="font-medium">{format(new Date(apiKey.expiration), 'MMM dd, yyyy')}</span>
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
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Edit modal component
const EditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  apiKey: APIKey | null;
  onSave: (data: UpdateKeyRequest) => Promise<void>;
}> = ({ isOpen, onClose, apiKey, onSave }) => {
  const [formData, setFormData] = useState<EditFormData>({
    name: '',
    rpm: 0,
    threadsLimit: 0,
    totalRequests: 0,
    isActive: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (apiKey) {
      setFormData({
        name: apiKey.name || '',
        rpm: apiKey.rpm,
        threadsLimit: apiKey.threadsLimit,
        totalRequests: apiKey.totalRequests,
        isActive: apiKey.isActive
      });
    }
  }, [apiKey]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;

    setIsLoading(true);
    try {
      const updateData: UpdateKeyRequest = {};
      
      // Only include changed values
      if (formData.name !== apiKey.name) updateData.name = formData.name;
      if (formData.rpm !== apiKey.rpm) updateData.rpm = formData.rpm;
      if (formData.threadsLimit !== apiKey.threadsLimit) updateData.threadsLimit = formData.threadsLimit;
      if (formData.totalRequests !== apiKey.totalRequests) updateData.totalRequests = formData.totalRequests;
      if (formData.isActive !== apiKey.isActive) updateData.isActive = formData.isActive;

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes detected');
        onClose();
        return;
      }

      await onSave(updateData);
      onClose();
    } catch (error) {
      console.error('Failed to update key:', error);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, formData, onSave, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit API Key">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="Name"
          value={formData.name}
          onChange={(value) => setFormData(prev => ({ ...prev, name: value as string }))}
          placeholder="API Key Name"
          error={errors.name}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="RPM (0 = Unlimited)"
            value={formData.rpm}
            onChange={(value) => setFormData(prev => ({ ...prev, rpm: value as number }))}
            type="number"
            min={0}
            max={10000}
            error={errors.rpm}
          />

          <FormInput
            label="Threads (0 = Unlimited)"
            value={formData.threadsLimit}
            onChange={(value) => setFormData(prev => ({ ...prev, threadsLimit: value as number }))}
            type="number"
            min={0}
            max={1000}
            error={errors.threadsLimit}
          />
        </div>

        <FormInput
          label="Total Requests (0 = Unlimited)"
          value={formData.totalRequests}
          onChange={(value) => setFormData(prev => ({ ...prev, totalRequests: value as number }))}
          type="number"
          min={0}
          error={errors.totalRequests}
        />

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isActive"
            checked={formData.isActive}
            onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Active
          </label>
        </div>

        <div className="flex space-x-3 pt-4">
          <ActionButton
            onClick={onClose}
            variant="secondary"
            size="md"
          >
            Cancel
          </ActionButton>
          <ActionButton
            onClick={() => {}}
            type="submit"
            loading={isLoading}
            variant="primary"
            size="md"
          >
            Update Key
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
};

// Main component
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
    setKeysError,
    clearSelectedKeys
  } = useStore();

  const [filteredKeys, setFilteredKeys] = useState<APIKey[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [currentPage, setCurrentPage] = useState(1);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const itemsPerPage = 10;

  const getKeyStatus = useCallback((key: APIKey): KeyStatus => {
    const now = new Date();
    const expirationDate = new Date(key.expiration);
    
    if (!key.isActive) return 'inactive';
    if (expirationDate <= now) return 'expired';
    return 'active';
  }, []);

  const totalCounts = useMemo(() => {
    const safeApiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    const now = new Date();
    
    return {
      total: safeApiKeys.length,
      active: safeApiKeys.filter(key => key.isActive && new Date(key.expiration) > now).length,
      expired: safeApiKeys.filter(key => new Date(key.expiration) <= now).length,
      inactive: safeApiKeys.filter(key => !key.isActive).length
    };
  }, [apiKeys]);

  const fetchKeys = useCallback(async (useCache = true) => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime;
    
    if (timeSinceLastFetch < 1000) return;

    try {
      setKeysLoading(true);
      setKeysError(null);
      setRetryAttempts(0);
      setLastFetchTime(now);
      
      const response = await apiService.getKeys({ limit: 1000 }, useCache);
      const keysData = response.data || [];
      
      setApiKeys(keysData);
    } catch (error: unknown) {
      console.error('Failed to fetch keys:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unable to load API keys. Please try again.';
      setKeysError(errorMessage);
      
      if (retryAttempts < 3 && timeSinceLastFetch > 5000) {
        setRetryAttempts(prev => prev + 1);
        const retryDelay = Math.min(1000 * (retryAttempts + 1), 5000);
        setTimeout(() => fetchKeys(false), retryDelay);
      }
    } finally {
      setKeysLoading(false);
    }
  }, [setApiKeys, setKeysLoading, setKeysError, retryAttempts, lastFetchTime]);

  // Filter keys based on search and status
  useEffect(() => {
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

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleEdit = useCallback(async (updateData: UpdateKeyRequest) => {
    if (!editingKey) return;

    const response = await apiService.updateKey(editingKey.id, updateData);
    updateApiKey(response.data);
    toast.success('API key updated successfully');
  }, [editingKey, updateApiKey]);

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
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete API key';
      toast.error(errorMessage);
    }
  }, [removeApiKey]);

  const handleBulkDelete = useCallback(async () => {
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

      clearSelectedKeys();

      if (successKeys.length > 0) {
        toast.success(`Successfully deleted ${successKeys.length} API key(s)`);
      }
      if (failedKeys.length > 0) {
        toast.error(`Failed to delete ${failedKeys.length} API key(s). Please try again.`);
      }
    } catch {
      toast.error('Bulk delete operation failed. Please try again.');
    }
  }, [selectedKeys, removeApiKey, clearSelectedKeys]);

  const exportKeys = useCallback(() => {
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
  }, [filteredKeys, getKeyStatus]);

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
    const paginatedKeys = filteredKeys.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    if (selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0) {
      clearSelectedKeys();
    } else {
      setSelectedKeys(new Set(paginatedKeys.map(key => key.id)));
    }
  }, [filteredKeys, currentPage, selectedKeys.size, clearSelectedKeys, setSelectedKeys]);

  const totalPages = Math.ceil(filteredKeys.length / itemsPerPage);
  const paginatedKeys = filteredKeys.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (keysLoading && (!apiKeys || apiKeys.length === 0)) {
    return <LoadingSpinner message="Loading your API keys..." />;
  }

  if (keysError && (!apiKeys || apiKeys.length === 0)) {
    return (
      <ErrorDisplay
        title="Unable to Load API Keys"
        message={keysError}
        onRetry={() => fetchKeys(false)}
        retryLabel="Try Again"
      />
    );
  }

  return (
    <div className="space-y-6">
      <FilterControls
        searchTerm={searchTerm}
        filterStatus={filterStatus}
        onSearchChange={setSearchTerm}
        onFilterChange={setFilterStatus}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCounts={totalCounts}
      />

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredKeys.length.toLocaleString()} of {Array.isArray(apiKeys) ? apiKeys.length.toLocaleString() : '0'} API keys
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <AnimatePresence>
            {selectedKeys.size > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <ActionButton
                  onClick={handleBulkDelete}
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                >
                  Delete ({selectedKeys.size})
                </ActionButton>
              </motion.div>
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
            onClick={() => fetchKeys(false)}
            loading={keysLoading}
            variant="primary"
            size="sm"
            icon={RefreshCw}
          >
            Refresh
          </ActionButton>
        </div>
      </div>

      {paginatedKeys.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6">
            <div className="grid gap-4">
              {paginatedKeys.map((key) => (
                <KeyCard
                  key={key.id}
                  apiKey={key}
                  isSelected={selectedKeys.has(key.id)}
                  onSelect={() => toggleKeySelection(key.id)}
                  onEdit={() => setEditingKey(key)}
                  onDelete={() => handleDelete(key.id, key.name)}
                  onCopy={() => toast.success('API key copied to clipboard!')}
                  getKeyStatus={getKeyStatus}
                />
              ))}
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

      <EditModal
        isOpen={!!editingKey}
        onClose={() => setEditingKey(null)}
        apiKey={editingKey}
        onSave={handleEdit}
      />
    </div>
  );
};

export default ManageKeys;