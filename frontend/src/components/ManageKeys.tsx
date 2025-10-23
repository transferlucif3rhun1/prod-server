import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MoreVertical, Edit3, Trash2, RefreshCw, Download,
  Calendar, Activity, Users, Zap, Plus, Copy, Clock, 
  HelpCircle, AlertTriangle, CheckCircle, X, User, Timer,
  Hash, Shield, Settings
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

type KeyStatus = 'active' | 'expired' | 'inactive';

const getKeyStatus = (key: APIKey): KeyStatus => {
  if (!key.isActive) return 'inactive';
  
  const now = new Date();
  const expirationDate = new Date(key.expiration);
  
  if (expirationDate <= now) {
    return 'expired';
  }
  
  return 'active';
};

const getStatusColor = (status: KeyStatus): string => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800 border-green-200';
    case 'expired': return 'bg-red-100 text-red-800 border-red-200';
    case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getExpirationWarning = (expiration: string): { isWarning: boolean; daysLeft: number; color: string } => {
  const expirationDate = new Date(expiration);
  const now = new Date();
  const diffTime = expirationDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    return { isWarning: true, daysLeft: diffDays, color: 'bg-red-100 text-red-800 border-red-200' };
  } else if (diffDays <= 3) {
    return { isWarning: true, daysLeft: diffDays, color: 'bg-orange-100 text-orange-800 border-orange-200' };
  } else if (diffDays <= 7) {
    return { isWarning: false, daysLeft: diffDays, color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  }
  
  return { isWarning: false, daysLeft: diffDays, color: 'bg-blue-100 text-blue-800 border-blue-200' };
};

const validateExpirationUpdate = (expirationStr: string): string | null => {
  if (!expirationStr || expirationStr.length < 2) {
    return 'Invalid expiration format';
  }

  const match = expirationStr.match(/^(\d+)([mhdwmy]|mo)$/);
  if (!match) {
    return 'Expiration must be in format like "1d", "2w", "1mo", "1y"';
  }

  const [, valueStr, unit] = match;
  const value = parseInt(valueStr, 10);

  if (value < 1) {
    return 'Expiration value must be at least 1';
  }

  const maxValues: Record<string, number> = {
    'm': 525600,
    'h': 8760,
    'd': 365,
    'w': 52,
    'mo': 12,
    'y': 5
  };

  if (value > (maxValues[unit] || 365)) {
    return `Maximum value for ${unit} is ${maxValues[unit]}`;
  }

  return null;
};

const getExpirationHint = (value: string, unit: string): string => {
  const numValue = parseInt(value, 10);
  if (isNaN(numValue) || numValue < 1) return '';
  
  const now = new Date();
  let futureDate = new Date(now);
  
  switch (unit) {
    case 'm':
      futureDate.setMinutes(futureDate.getMinutes() + numValue);
      break;
    case 'h':
      futureDate.setHours(futureDate.getHours() + numValue);
      break;
    case 'd':
      futureDate.setDate(futureDate.getDate() + numValue);
      break;
    case 'w':
      futureDate.setDate(futureDate.getDate() + (numValue * 7));
      break;
    case 'mo':
      futureDate.setMonth(futureDate.getMonth() + numValue);
      break;
    case 'y':
      futureDate.setFullYear(futureDate.getFullYear() + numValue);
      break;
    default:
      return '';
  }
  
  return `Will expire on ${format(futureDate, 'MMM dd, yyyy HH:mm')}`;
};

const FilterControls: React.FC<{
  searchTerm: string;
  filterStatus: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  totalCounts: { total: number; active: number; expired: number; inactive: number };
}> = ({ 
  searchTerm, 
  filterStatus, 
  onSearchChange, 
  onFilterChange,
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
  </div>
);

const Tooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {isVisible && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50 whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

const ProgressBar: React.FC<{ 
  current: number; 
  max: number; 
  label: string;
  color?: string;
}> = ({ current, max, label, color = "bg-blue-500" }) => {
  const percentage = max === 0 ? 0 : Math.min((current / max) * 100, 100);
  const isUnlimited = max === 0;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
        <span>{label}</span>
        <span>{isUnlimited ? 'Unlimited' : `${current.toLocaleString()} / ${max.toLocaleString()}`}</span>
      </div>
      {!isUnlimited && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={`${color} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
};

const KeyCard: React.FC<{
  apiKey: APIKey;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}> = ({ apiKey, isSelected, onSelect, onEdit, onDelete, onCopy }) => {
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showFullName, setShowFullName] = useState(false);
  
  const status = useMemo(() => getKeyStatus(apiKey), [apiKey]);
  const statusColor = useMemo(() => getStatusColor(status), [status]);
  const expirationInfo = useMemo(() => getExpirationWarning(apiKey.expiration), [apiKey.expiration]);
  
  const usageDisplay = useMemo(() => 
    formatUsageDisplay(Number(apiKey.usageCount), Number(apiKey.totalRequests)), 
    [apiKey.usageCount, apiKey.totalRequests]
  );

  const keyEnvironment = useMemo(() => {
    const name = apiKey.name?.toLowerCase() || '';
    if (name.includes('prod') || name.includes('production')) return { tag: 'PROD', color: 'bg-red-100 text-red-800' };
    if (name.includes('test') || name.includes('staging')) return { tag: 'TEST', color: 'bg-yellow-100 text-yellow-800' };
    if (name.includes('dev') || name.includes('development')) return { tag: 'DEV', color: 'bg-green-100 text-green-800' };
    return null;
  }, [apiKey.name]);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(apiKey.id);
      toast.success('API key copied to clipboard!');
      onCopy();
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [apiKey.id, onCopy]);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowActionMenu(false);
    onEdit();
  }, [onEdit]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowActionMenu(false);
    onDelete();
  }, [onDelete]);

  const toggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowActionMenu(prev => !prev);
  }, []);

  const expirationDisplay = useMemo(() => {
    const expirationDate = new Date(apiKey.expiration);
    const now = new Date();
    const isExpired = expirationDate <= now;
    
    return {
      formatted: format(expirationDate, 'MMM dd, yyyy HH:mm'),
      isExpired,
      timeRemaining: isExpired ? 'Expired' : `Expires ${format(expirationDate, 'MMM dd, yyyy')}`
    };
  }, [apiKey.expiration]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showActionMenu) {
        setShowActionMenu(false);
      }
    };

    if (showActionMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showActionMenu]);

  const displayName = apiKey.name || 'Untitled Key';
  const isNameTruncated = displayName.length > 25;
  const truncatedName = isNameTruncated ? `${displayName.substring(0, 25)}...` : displayName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-5 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:shadow-lg transition-all duration-300 bg-white dark:bg-gray-800 hover:scale-[1.02] border-l-4 ${
        status === 'active' ? 'border-l-green-500' : 
        status === 'expired' ? 'border-l-red-500' : 
        'border-l-gray-400'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div
                className="relative"
                onMouseEnter={() => setShowFullName(true)}
                onMouseLeave={() => setShowFullName(false)}
              >
                <h3 className="font-semibold text-gray-900 dark:text-white text-base">
                  {isNameTruncated && !showFullName ? truncatedName : displayName}
                </h3>
                {showFullName && isNameTruncated && (
                  <div className="absolute top-full left-0 mt-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50 whitespace-nowrap">
                    {displayName}
                  </div>
                )}
              </div>
              {keyEnvironment && (
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${keyEnvironment.color}`}>
                  {keyEnvironment.tag}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {apiKey.maskedKey || `${apiKey.id.substring(0, 4)}...${apiKey.id.substring(apiKey.id.length - 4)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          <Tooltip content="Copy API Key">
            <button
              onClick={handleCopy}
              className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </Tooltip>
          <div className="relative">
            <Tooltip content="Edit / Delete">
              <button
                onClick={toggleMenu}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </Tooltip>
            {showActionMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 min-w-[140px] overflow-hidden"
              >
                <button
                  onClick={handleEdit}
                  className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Key</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Key</span>
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm">
            <Timer className="w-4 h-4 text-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">RPM Limit:</span>
            <span className="font-semibold">{apiKey.rpm === 0 ? 'Unlimited' : formatValue(apiKey.rpm)}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm">
            <User className="w-4 h-4 text-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">Thread Limit:</span>
            <span className="font-semibold">{apiKey.threadsLimit === 0 ? 'Unlimited' : formatValue(apiKey.threadsLimit)}</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <ProgressBar
            current={Number(apiKey.usageCount)}
            max={Number(apiKey.totalRequests)}
            label="Usage"
            color={usageDisplay.percentage && usageDisplay.percentage > 80 ? "bg-red-500" : "bg-blue-500"}
          />
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-purple-500" />
          <span className={`text-sm px-3 py-1 rounded-full border ${expirationInfo.color}`}>
            {expirationInfo.daysLeft <= 0 ? 'Expired' : 
             expirationInfo.daysLeft === 1 ? 'Expires today' :
             expirationInfo.daysLeft <= 7 ? `${expirationInfo.daysLeft} days left` :
             `Expires ${format(new Date(apiKey.expiration), 'MMM dd')}`}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Created {format(new Date(apiKey.createdAt), 'MMM dd, yyyy')}
        </div>
      </div>
    </motion.div>
  );
};

interface ExpirationUnit {
  value: string;
  label: string;
}

const EXPIRATION_UNITS: ExpirationUnit[] = [
  { value: 'm', label: 'Minutes' },
  { value: 'h', label: 'Hours' },
  { value: 'd', label: 'Days' },
  { value: 'w', label: 'Weeks' },
  { value: 'mo', label: 'Months' },
  { value: 'y', label: 'Years' }
];

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
  const [expirationValue, setExpirationValue] = useState('');
  const [expirationUnit, setExpirationUnit] = useState('d');
  const [updateExpiration, setUpdateExpiration] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (apiKey) {
      setFormData({
        name: apiKey.name || '',
        rpm: apiKey.rpm,
        threadsLimit: apiKey.threadsLimit,
        totalRequests: apiKey.totalRequests,
        isActive: apiKey.isActive
      });
      setExpirationValue('7');
      setExpirationUnit('d');
      setUpdateExpiration(false);
      setErrors({});
      setWarnings({});
    }
  }, [apiKey]);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    const newWarnings: Record<string, string> = {};
    
    if (!formData.name || formData.name.trim().length < 1) {
      newErrors.name = 'Name is required';
    }
    
    if (formData.rpm < 0 || formData.rpm > 10000) {
      newErrors.rpm = 'RPM must be between 0 and 10000';
    }
    
    if (formData.threadsLimit < 0 || formData.threadsLimit > 1000) {
      newErrors.threadsLimit = 'Thread limit must be between 0 and 1000';
    }
    
    if (formData.totalRequests < 0) {
      newErrors.totalRequests = 'Total requests must be 0 or greater';
    }

    // Check for conflicting values
    if (formData.rpm > 0 && formData.totalRequests > 0) {
      const estimatedTime = formData.totalRequests / formData.rpm;
      if (estimatedTime < 1) {
        newWarnings.conflict = `With ${formData.rpm} RPM, ${formData.totalRequests} requests will complete in less than 1 minute`;
      }
    }
    
    if (updateExpiration) {
      const numValue = parseInt(expirationValue, 10);
      if (isNaN(numValue) || numValue < 1) {
        newErrors.expiration = 'Expiration value must be at least 1';
      } else if (numValue > 1000) {
        newErrors.expiration = 'Expiration value too large';
      } else {
        const expirationString = expirationValue + expirationUnit;
        const expirationError = validateExpirationUpdate(expirationString);
        if (expirationError) {
          newErrors.expiration = expirationError;
        }
      }
    }
    
    setErrors(newErrors);
    setWarnings(newWarnings);
    return Object.keys(newErrors).length === 0;
  }, [formData, expirationValue, expirationUnit, updateExpiration]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;

    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setIsLoading(true);
    try {
      const updateData: UpdateKeyRequest = {};
      
      if (formData.name.trim() !== (apiKey.name || '').trim()) {
        updateData.name = formData.name.trim();
      }
      if (formData.rpm !== apiKey.rpm) updateData.rpm = formData.rpm;
      if (formData.threadsLimit !== apiKey.threadsLimit) updateData.threadsLimit = formData.threadsLimit;
      if (formData.totalRequests !== apiKey.totalRequests) updateData.totalRequests = formData.totalRequests;
      if (formData.isActive !== apiKey.isActive) updateData.isActive = formData.isActive;
      
      if (updateExpiration) {
        const expirationString = expirationValue + expirationUnit;
        updateData.expiration = expirationString;
      }

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes detected');
        onClose();
        return;
      }

      await onSave(updateData);
      toast.success('API key updated successfully');
      onClose();
    } catch (error) {
      console.error('Failed to update key:', error);
      toast.error('Failed to update API key');
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, formData, expirationValue, expirationUnit, updateExpiration, onSave, onClose, validateForm]);

  const expirationHint = useMemo(() => {
    if (updateExpiration && expirationValue && expirationUnit) {
      return getExpirationHint(expirationValue, expirationUnit);
    }
    return '';
  }, [expirationValue, expirationUnit, updateExpiration]);

  const handleInputChange = useCallback((field: keyof EditFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (warnings[field]) {
      setWarnings(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors, warnings]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit API Key">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
          <div className="flex items-center space-x-2 mb-3">
            <Shield className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Key Information</h3>
          </div>
          
          <div className="relative">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Edit3 className="w-4 h-4 mr-2 text-blue-500" />
              Name
              <Tooltip content="A descriptive name for your API key to help you identify its purpose">
                <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
              </Tooltip>
            </label>
            <FormInput
              value={formData.name}
              onChange={(value) => handleInputChange('name', value)}
              placeholder="e.g., Production API Key"
              error={errors.name}
              required
              aria-label="API Key Name"
            />
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
          <div className="flex items-center space-x-2 mb-3">
            <Settings className="w-5 h-5 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Rate Limits & Usage</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Timer className="w-4 h-4 mr-2 text-yellow-500" />
                RPM (0 = Unlimited)
                <Tooltip content="Requests per minute - how many API calls can be made per minute">
                  <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
                </Tooltip>
              </label>
              <FormInput
                value={formData.rpm}
                onChange={(value) => handleInputChange('rpm', Number(value))}
                type="number"
                min={0}
                max={10000}
                error={errors.rpm}
                aria-label="Requests per minute limit"
              />
            </div>

            <div className="relative">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <User className="w-4 h-4 mr-2 text-blue-500" />
                Threads (0 = Unlimited)
                <Tooltip content="Maximum number of concurrent connections allowed">
                  <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
                </Tooltip>
              </label>
              <FormInput
                value={formData.threadsLimit}
                onChange={(value) => handleInputChange('threadsLimit', Number(value))}
                type="number"
                min={0}
                max={1000}
                error={errors.threadsLimit}
                aria-label="Thread limit"
              />
            </div>
          </div>

          <div className="relative">
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Hash className="w-4 h-4 mr-2 text-green-500" />
              Total Requests (0 = Unlimited)
              <Tooltip content="Total number of requests this key can make before expiring">
                <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
              </Tooltip>
            </label>
            <FormInput
              value={formData.totalRequests}
              onChange={(value) => handleInputChange('totalRequests', Number(value))}
              type="number"
              min={0}
              error={errors.totalRequests}
              aria-label="Total requests limit"
            />
          </div>

          {warnings.conflict && (
            <div className="flex items-center space-x-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-800 dark:text-yellow-300">{warnings.conflict}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="updateExpiration"
              checked={updateExpiration}
              onChange={(e) => setUpdateExpiration(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              aria-label="Update expiration"
            />
            <label htmlFor="updateExpiration" className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
              <Clock className="w-4 h-4 mr-2 text-purple-500" />
              Update Expiration
            </label>
          </div>
          
          <AnimatePresence>
            {updateExpiration && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-700"
              >
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Calendar className="w-4 h-4 mr-2 text-purple-500" />
                  New Expiration (from now)
                </label>
                <div className="flex space-x-3">
                  <div className="flex-1">
                    <FormInput
                      value={expirationValue}
                      onChange={(value) => {
                        setExpirationValue(String(value));
                        if (errors.expiration) {
                          setErrors(prev => ({ ...prev, expiration: '' }));
                        }
                      }}
                      type="number"
                      min={1}
                      error={errors.expiration}
                      placeholder="7"
                      disabled={!updateExpiration}
                      aria-label="Expiration duration"
                    />
                  </div>
                  <select
                    value={expirationUnit}
                    onChange={(e) => {
                      setExpirationUnit(e.target.value);
                      if (errors.expiration) {
                        setErrors(prev => ({ ...prev, expiration: '' }));
                      }
                    }}
                    disabled={!updateExpiration}
                    className={`px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 focus:border-blue-500 transition-all duration-200 min-w-[120px] ${
                      updateExpiration 
                        ? 'bg-white dark:bg-gray-700' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                    }`}
                    aria-label="Expiration unit"
                  >
                    {EXPIRATION_UNITS.map(unit => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
                {expirationHint && (
                  <div className="flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-800 dark:text-green-300">{expirationHint}</span>
                  </div>
                )}
                {errors.expiration && (
                  <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                    <X className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-800 dark:text-red-300">{errors.expiration}</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Note: Months are calculated as calendar months (28-31 days depending on the month)
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <input
            type="checkbox"
            id="isActive"
            checked={formData.isActive}
            onChange={(e) => handleInputChange('isActive', e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            aria-label="Key is active"
          />
          <label htmlFor="isActive" className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
            <Zap className="w-4 h-4 mr-2 text-green-500" />
            Active Key
            <Tooltip content="When disabled, this API key will not work for requests">
              <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
            </Tooltip>
          </label>
        </div>

        <div className="flex space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <ActionButton
            onClick={onClose}
            variant="secondary"
            size="md"
            type="button"
            className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl hover:scale-105 transition-transform"
            aria-label="Cancel editing"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </ActionButton>
          <ActionButton
            onClick={() => {}}
            type="submit"
            loading={isLoading}
            variant="primary"
            size="md"
            className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl hover:scale-105 transition-transform"
            aria-label="Save changes"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Update Key</span>
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
};

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
  const [currentPage, setCurrentPage] = useState(1);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const itemsPerPage = 10;

  const totalCounts = useMemo(() => {
    const safeApiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    
    return {
      total: safeApiKeys.length,
      active: safeApiKeys.filter(key => getKeyStatus(key) === 'active').length,
      expired: safeApiKeys.filter(key => getKeyStatus(key) === 'expired').length,
      inactive: safeApiKeys.filter(key => getKeyStatus(key) === 'inactive').length
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
  }, [apiKeys, searchTerm, filterStatus]);

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleEdit = useCallback(async (updateData: UpdateKeyRequest) => {
    if (!editingKey) return;

    const response = await apiService.updateKey(editingKey.id, updateData);
    updateApiKey(response.data);
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
  }, [filteredKeys]);

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
                  className="hover:scale-105 transition-transform"
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
            className="hover:scale-105 transition-transform"
          >
            Export
          </ActionButton>

          <ActionButton
            onClick={() => fetchKeys(false)}
            loading={keysLoading}
            variant="primary"
            size="sm"
            icon={RefreshCw}
            className="hover:scale-105 transition-transform"
          >
            Refresh
          </ActionButton>
        </div>
      </div>

      {paginatedKeys.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6">
            <div className="grid gap-6">
              {paginatedKeys.map((key) => (
                <KeyCard
                  key={key.id}
                  apiKey={key}
                  isSelected={selectedKeys.has(key.id)}
                  onSelect={() => toggleKeySelection(key.id)}
                  onEdit={() => setEditingKey(key)}
                  onDelete={() => handleDelete(key.id, key.name)}
                  onCopy={() => {}}
                />
              ))}
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all hover:scale-105"
              >
                Previous
              </button>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={selectAll}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:scale-105 transition-all"
                >
                  {selectedKeys.size === paginatedKeys.length && paginatedKeys.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all hover:scale-105"
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