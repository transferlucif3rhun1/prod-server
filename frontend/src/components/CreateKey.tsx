import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Key, Clock, Zap, Users, RefreshCw, 
  Sparkles, Code, Shield, Timer, AlertTriangle,
  Info, CheckCircle, RotateCcw
} from 'lucide-react';

// Mock types and services for demo
interface CreateKeyRequest {
  name: string;
  rpm: number;
  threadsLimit: number;
  totalRequests: number;
  customKey?: string;
  expiration: string;
}

interface APIKey {
  id: string;
  name: string;
  rpm: number;
  threadsLimit: number;
  totalRequests: number;
  expiration: string;
  createdAt: string;
}

interface FormData extends CreateKeyRequest {
  expirationValue: string;
  expirationUnit: string;
}

interface PresetConfig {
  name: string;
  icon: React.ElementType;
  description: string;
  color: string;
  data: Partial<FormData>;
  tooltip: {
    rpm: string;
    threadsLimit: string;
    totalRequests: string;
    expiration: string;
  };
}

interface ExpirationUnit {
  value: string;
  label: string;
  icon: React.ElementType;
}

const EXPIRATION_UNITS: ExpirationUnit[] = [
  { value: 'm', label: 'Minutes', icon: Timer },
  { value: 'h', label: 'Hours', icon: Clock },
  { value: 'd', label: 'Days', icon: Clock },
  { value: 'w', label: 'Weeks', icon: Clock },
  { value: 'mo', label: 'Months', icon: Clock },
  { value: 'y', label: 'Years', icon: Clock }
];

const PRESETS: PresetConfig[] = [
  {
    name: 'Development',
    icon: Code,
    description: 'Perfect for testing and development',
    color: 'from-blue-500 to-cyan-500',
    data: { 
      rpm: 50, 
      threadsLimit: 5, 
      totalRequests: 500, 
      expirationValue: '7', 
      expirationUnit: 'd' 
    },
    tooltip: {
      rpm: '50 requests/min - Good for development testing',
      threadsLimit: '5 concurrent threads - Light usage',
      totalRequests: '500 total requests - Perfect for prototyping',
      expiration: '7 days - Short-term development cycle'
    }
  },
  {
    name: 'Production',
    icon: Sparkles,
    description: 'High-performance production ready',
    color: 'from-purple-500 to-pink-500',
    data: { 
      rpm: 1000, 
      threadsLimit: 50, 
      totalRequests: 100000, 
      expirationValue: '1', 
      expirationUnit: 'y' 
    },
    tooltip: {
      rpm: '1000 requests/min - High throughput',
      threadsLimit: '50 concurrent threads - Heavy workload',
      totalRequests: '100,000 total requests - Production scale',
      expiration: '1 year - Long-term production use'
    }
  },
  {
    name: 'Testing',
    icon: Shield,
    description: 'Quick testing with limited scope',
    color: 'from-green-500 to-emerald-500',
    data: { 
      rpm: 10, 
      threadsLimit: 2, 
      totalRequests: 100, 
      expirationValue: '1', 
      expirationUnit: 'd' 
    },
    tooltip: {
      rpm: '10 requests/min - Light testing load',
      threadsLimit: '2 concurrent threads - Minimal usage',
      totalRequests: '100 total requests - Quick testing',
      expiration: '1 day - Short-term testing'
    }
  }
];

const DEFAULT_FORM: FormData = {
  name: '',
  rpm: 100,
  threadsLimit: 10,
  totalRequests: 1000,
  customKey: '',
  expiration: '30d',
  expirationValue: '30',
  expirationUnit: 'd'
};

// Mock store and services
const useStore = () => ({
  createKeyForm: DEFAULT_FORM,
  setCreateKeyForm: (data: FormData) => console.log('Setting form:', data),
  addApiKey: (key: APIKey) => console.log('Adding key:', key)
});

const apiService = {
  createKey: async (data: CreateKeyRequest): Promise<{ data: APIKey }> => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
      data: {
        id: `sk_${Math.random().toString(36).substr(2, 16)}`,
        name: data.name,
        rpm: data.rpm,
        threadsLimit: data.threadsLimit,
        totalRequests: data.totalRequests,
        expiration: data.expiration,
        createdAt: new Date().toISOString()
      }
    };
  }
};

const toast = {
  success: (message: string) => console.log('Success:', message),
  error: (message: string) => console.log('Error:', message)
};

// Utility functions
const validateApiKeyName = (name: string): string | null => {
  if (!name.trim()) return 'Name is required';
  if (name.length < 2) return 'Name must be at least 2 characters';
  if (name.length > 50) return 'Name must be less than 50 characters';
  return null;
};

const validateCustomKey = (key: string): string | null => {
  if (!key) return null;
  if (key.length < 16) return 'Custom key must be at least 16 characters';
  if (key.length > 64) return 'Custom key must be less than 64 characters';
  return null;
};

const formatValue = (value: number): string => {
  if (value === 0) return 'Unlimited';
  return value.toLocaleString();
};

// Enhanced Input Component with focus animations
const FormInput: React.FC<{
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  min?: number;
  max?: number;
  icon?: React.ElementType;
  isHighlighted?: boolean;
}> = ({ 
  label, 
  value, 
  onChange, 
  type = 'text', 
  placeholder, 
  error, 
  required, 
  min, 
  max, 
  icon: Icon,
  isHighlighted = false 
}) => {
  const [isFocused, setIsFocused] = useState(false);
  
  return (
    <motion.div 
      className="space-y-2"
      animate={isHighlighted ? { 
        scale: [1, 1.02, 1],
        boxShadow: ['0 0 0 0px rgba(59, 130, 246, 0)', '0 0 0 4px rgba(59, 130, 246, 0.3)', '0 0 0 0px rgba(59, 130, 246, 0)']
      } : {}}
      transition={{ duration: 0.6 }}
    >
      <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300">
        {Icon && <Icon className="w-4 h-4 mr-2 text-blue-500" />}
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <motion.div
        animate={isFocused ? { scale: 1.01 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          min={min}
          max={max}
          className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-300 ${
            error 
              ? 'border-red-300 bg-red-50 dark:border-red-600 dark:bg-red-900/20' 
              : isFocused
                ? 'border-blue-500 bg-white dark:bg-gray-600 shadow-lg shadow-blue-500/20'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300'
          } focus:outline-none focus:ring-0`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${label}-error` : undefined}
        />
      </motion.div>
      
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-sm text-red-500 flex items-center"
            id={`${label}-error`}
            role="alert"
          >
            <AlertTriangle className="w-4 h-4 mr-1" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Enhanced Preset Selector with tooltips
const PresetSelector: React.FC<{ 
  onSelect: (preset: PresetConfig) => void;
}> = ({ onSelect }) => {
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
        <Sparkles className="w-5 h-5 mr-2 text-purple-500" />
        Quick Presets
      </h3>
      
      <div className="space-y-3">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isHovered = hoveredPreset === preset.name;
          
          return (
            <div key={preset.name} className="relative">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelect(preset)}
                onMouseEnter={() => setHoveredPreset(preset.name)}
                onMouseLeave={() => setHoveredPreset(null)}
                className={`w-full p-4 text-left rounded-xl bg-gradient-to-r ${preset.color} text-white hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2`}
                aria-label={`Apply ${preset.name} preset configuration`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className="w-6 h-6" />
                  <div className="flex-1">
                    <div className="font-semibold">{preset.name}</div>
                    <div className="text-sm opacity-90">{preset.description}</div>
                  </div>
                  <Info className="w-4 h-4 opacity-60" />
                </div>
              </motion.button>
              
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: 10, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 10, scale: 0.95 }}
                    className="absolute left-full top-0 ml-4 z-50 w-72 bg-gray-900 text-white rounded-lg p-4 shadow-xl"
                  >
                    <div className="text-sm font-semibold mb-2">{preset.name} Configuration</div>
                    <div className="space-y-1 text-xs">
                      <div>{preset.tooltip.rpm}</div>
                      <div>{preset.tooltip.threadsLimit}</div>
                      <div>{preset.tooltip.totalRequests}</div>
                      <div>{preset.tooltip.expiration}</div>
                    </div>
                    <div className="absolute top-4 -left-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Enhanced Configuration Preview with sticky positioning
const ConfigPreview: React.FC<{ 
  formData: FormData;
  onReset: () => void;
  hasConflicts: boolean;
  conflicts: string[];
}> = ({ formData, onReset, hasConflicts, conflicts }) => {
  const getUnitDisplayName = useCallback((unit: string) => {
    const unitObj = EXPIRATION_UNITS.find(u => u.value === unit);
    return unitObj?.label || unit;
  }, []);

  const previewItems = useMemo(() => [
    { label: 'Name', value: formData.name || 'Untitled' },
    { label: 'RPM', value: formatValue(formData.rpm) },
    { label: 'Threads', value: formatValue(formData.threadsLimit) },
    { label: 'Total Requests', value: formatValue(formData.totalRequests) },
    { label: 'Expires', value: `${formData.expirationValue} ${getUnitDisplayName(formData.expirationUnit)}` }
  ], [formData, getUnitDisplayName]);

  return (
    <div className="sticky top-8">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
            Configuration Preview
          </h3>
          <button
            onClick={onReset}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Reset to default configuration"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        
        <AnimatePresence>
          {hasConflicts && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg"
            >
              <div className="flex items-center text-amber-800 dark:text-amber-400 text-sm font-medium mb-2">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Configuration Warnings
              </div>
              <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                {conflicts.map((conflict, index) => (
                  <li key={index}>• {conflict}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="space-y-4">
          {previewItems.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
              <span className="text-gray-600 dark:text-gray-400">{label}:</span>
              <span className="font-medium text-gray-900 dark:text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Success Notification Component
const SuccessNotification: React.FC<{ apiKey: APIKey; onClose: () => void }> = ({ apiKey, onClose }) => (
  <motion.div
    initial={{ opacity: 0, y: -20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -20, scale: 0.95 }}
    className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 p-6"
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-green-100 dark:bg-green-800/20 rounded-full -translate-y-16 translate-x-16"></div>
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-500 rounded-lg">
            <Key className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-green-800 dark:text-green-400">
              API Key Created Successfully!
            </h3>
            <p className="text-sm text-green-600 dark:text-green-500">
              Your new API key is ready to use
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 focus:outline-none focus:ring-2 focus:ring-green-500 rounded p-1"
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-green-700 dark:text-green-400 mb-2">
            API Key
          </label>
          <div className="flex items-center space-x-3">
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-700 p-3">
              <code className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                {apiKey.id}
              </code>
            </div>
            <button 
              onClick={() => navigator.clipboard.writeText(apiKey.id)}
              className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Copy API key to clipboard"
            >
              Copy
            </button>
          </div>
        </div>
        
        {apiKey.name && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-green-700 dark:text-green-400">Name:</span>
            <span className="font-medium text-green-800 dark:text-green-300">{apiKey.name}</span>
          </div>
        )}
      </div>
    </div>
  </motion.div>
);

// Main Component
const CreateKey: React.FC = () => {
  const { createKeyForm, setCreateKeyForm, addApiKey } = useStore();
  const [formData, setFormData] = useState<FormData>(createKeyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const updateExpiration = useCallback((value: string, unit: string) => {
    return value + unit;
  }, []);

  // Conflict detection
  const conflicts = useMemo(() => {
    const issues: string[] = [];
    
    if (formData.totalRequests > 0 && formData.rpm > 0) {
      const minutesToExhaust = formData.totalRequests / formData.rpm;
      if (minutesToExhaust < 10) {
        issues.push('Total requests may be exhausted in less than 10 minutes at current RPM');
      }
    }
    
    if (formData.threadsLimit > formData.rpm && formData.rpm > 0) {
      issues.push('Thread limit exceeds RPM - threads may be idle');
    }
    
    if (!formData.expirationValue || formData.expirationValue === '0') {
      issues.push('No expiration set - key will never expire');
    }
    
    return issues;
  }, [formData]);

  useEffect(() => {
    const { expirationValue, expirationUnit, ...rest } = formData;
    const expiration = updateExpiration(expirationValue, expirationUnit);
    const updatedData = {
      ...rest,
      expiration,
      expirationValue,
      expirationUnit
    };
    setCreateKeyForm(updatedData);
  }, [formData, setCreateKeyForm, updateExpiration]);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    const nameError = validateApiKeyName(formData.name);
    if (nameError) newErrors.name = nameError;

    if (formData.rpm < 0 || formData.rpm > 10000) {
      newErrors.rpm = 'RPM must be between 0 and 10,000 (0 = unlimited)';
    }

    if (formData.threadsLimit < 0 || formData.threadsLimit > 1000) {
      newErrors.threadsLimit = 'Thread limit must be between 0 and 1,000 (0 = unlimited)';
    }

    if (formData.totalRequests < 0) {
      newErrors.totalRequests = 'Total requests must be 0 or greater (0 = unlimited)';
    }

    if (formData.customKey) {
      const customKeyError = validateCustomKey(formData.customKey);
      if (customKeyError) newErrors.customKey = customKeyError;
    }

    const numValue = parseInt(formData.expirationValue, 10);
    if (isNaN(numValue) || numValue < 1) {
      newErrors.expiration = 'Expiration value must be at least 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleInputChange = useCallback((field: keyof FormData, value: string | number) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      if (field === 'expirationValue' || field === 'expirationUnit') {
        const newValue = field === 'expirationValue' ? String(value) : prev.expirationValue;
        const newUnit = field === 'expirationUnit' ? String(value) : prev.expirationUnit;
        updated.expiration = updateExpiration(newValue, newUnit);
      }
      
      return updated;
    });
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors, updateExpiration]);

  const applyPreset = useCallback((preset: PresetConfig) => {
    const fieldsToHighlight = new Set(['rpm', 'threadsLimit', 'totalRequests', 'expirationValue', 'expirationUnit']);
    setHighlightedFields(fieldsToHighlight);
    
    const expirationValue = preset.data.expirationValue || '30';
    const expirationUnit = preset.data.expirationUnit || 'd';
    
    setFormData(prev => ({
      ...prev,
      ...preset.data,
      expirationValue,
      expirationUnit,
      expiration: updateExpiration(expirationValue, expirationUnit)
    }));
    setErrors({});
    toast.success(`Applied ${preset.name} preset`);
    
    setTimeout(() => setHighlightedFields(new Set()), 600);
  }, [updateExpiration]);

  const resetForm = useCallback(() => {
    setFormData(DEFAULT_FORM);
    setCreatedKey(null);
    setErrors({});
    setHighlightedFields(new Set());
    toast.success('Form reset to defaults');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setIsLoading(true);

    try {
      const { expirationValue: _expirationValue, expirationUnit: _expirationUnit, ...submitData } = formData;
      
      if (!submitData.expiration) {
        submitData.expiration = updateExpiration(formData.expirationValue, formData.expirationUnit);
      }
      
      const response = await apiService.createKey(submitData);
      
      setCreatedKey(response.data);
      addApiKey(response.data);
      toast.success('API key created successfully!');
      
      setFormData(prev => ({
        ...prev,
        name: '',
        customKey: ''
      }));
      setErrors({});
    } catch (error: unknown) {
      toast.error('Failed to create API key');
    } finally {
      setIsLoading(false);
    }
  }, [formData, validateForm, addApiKey, updateExpiration]);

  return (
    <div className="space-y-8 pb-32">
      <AnimatePresence>
        {createdKey && (
          <SuccessNotification 
            apiKey={createdKey} 
            onClose={() => setCreatedKey(null)} 
          />
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                  <Key className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Create New API Key
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Generate a new API key with custom configuration
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Basic Information Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-6 border border-gray-200 dark:border-gray-600"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Key className="w-5 h-5 mr-2 text-blue-500" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormInput
                    label="Key Name"
                    value={formData.name}
                    onChange={(value) => handleInputChange('name', value)}
                    placeholder="My API Key"
                    error={errors.name}
                    required
                    isHighlighted={highlightedFields.has('name')}
                  />

                  <FormInput
                    label="Custom Key (Optional)"
                    value={formData.customKey}
                    onChange={(value) => handleInputChange('customKey', value)}
                    placeholder="Leave empty for auto-generation"
                    error={errors.customKey}
                    isHighlighted={highlightedFields.has('customKey')}
                  />
                </div>
              </motion.div>

              {/* Limits & Permissions Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-6 border border-gray-200 dark:border-gray-600"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-green-500" />
                  Limits & Permissions
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormInput
                    label="Requests Per Minute"
                    value={formData.rpm}
                    onChange={(value) => handleInputChange('rpm', value)}
                    type="number"
                    min={0}
                    max={10000}
                    error={errors.rpm}
                    icon={Zap}
                    isHighlighted={highlightedFields.has('rpm')}
                  />

                  <FormInput
                    label="Thread Limit"
                    value={formData.threadsLimit}
                    onChange={(value) => handleInputChange('threadsLimit', value)}
                    type="number"
                    min={0}
                    max={1000}
                    error={errors.threadsLimit}
                    icon={Users}
                    isHighlighted={highlightedFields.has('threadsLimit')}
                  />

                  <FormInput
                    label="Total Requests"
                    value={formData.totalRequests}
                    onChange={(value) => handleInputChange('totalRequests', value)}
                    type="number"
                    min={0}
                    error={errors.totalRequests}
                    isHighlighted={highlightedFields.has('totalRequests')}
                  />
                </div>
              </motion.div>

              {/* Expiration Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-6 border border-gray-200 dark:border-gray-600"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-purple-500" />
                  Expiration
                </h3>
                <div className="flex space-x-3">
                  <div className="flex-1">
                    <FormInput
                      label=""
                      value={formData.expirationValue}
                      onChange={(value) => handleInputChange('expirationValue', value)}
                      type="number"
                      min={1}
                      error={errors.expiration}
                      isHighlighted={highlightedFields.has('expirationValue')}
                    />
                  </div>
                  <div className="flex-1">
                    <motion.select
                      value={formData.expirationUnit}
                      onChange={(e) => handleInputChange('expirationUnit', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200 focus:outline-none"
                      animate={highlightedFields.has('expirationUnit') ? { 
                        scale: [1, 1.02, 1],
                        boxShadow: ['0 0 0 0px rgba(59, 130, 246, 0)', '0 0 0 4px rgba(59, 130, 246, 0.3)', '0 0 0 0px rgba(59, 130, 246, 0)']
                      } : {}}
                      transition={{ duration: 0.6 }}
                    >
                      {EXPIRATION_UNITS.map(unit => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </motion.select>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <PresetSelector onSelect={applyPreset} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <ConfigPreview 
              formData={formData} 
              onReset={resetForm}
              hasConflicts={conflicts.length > 0}
              conflicts={conflicts}
            />
          </motion.div>
        </div>
      </div>

      {/* Sticky Bottom Button */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-0 left-0 right-0 p-6 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-40"
      >
        <div className="max-w-4xl mx-auto flex justify-end">
          <motion.button
            onClick={handleSubmit}
            disabled={!formData.name.trim() || isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`px-8 py-4 rounded-xl font-semibold transition-all duration-200 flex items-center space-x-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              !formData.name.trim() || isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-lg shadow-blue-500/25'
            }`}
            aria-label={isLoading ? 'Creating API Key...' : 'Create API Key'}
          >
            {isLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Creating API Key...</span>
              </>
            ) : (
              <>
                <Key className="w-5 h-5" />
                <span>Create API Key</span>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      <div ref={bottomRef} className="h-1" />
    </div>
  );
};

export default CreateKey;