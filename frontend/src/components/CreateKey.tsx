import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Key, Clock, Zap, Users, RefreshCw, 
  Sparkles, Code, Shield, Timer 
} from 'lucide-react';
import { CreateKeyRequest, APIKey } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import { 
  FormInput, 
  ActionButton, 
  CopyButton, 
  StatusBadge, 
  validateApiKeyName, 
  validateCustomKey,
  formatValue 
} from './shared';
import toast from 'react-hot-toast';

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
}

interface ExpirationUnit {
  value: string;
  label: string;
  icon: React.ElementType;
}

// Configuration constants
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
    }
  }
];

// Validation rules
const VALIDATION_RULES = {
  name: { min: 2, max: 50, required: true },
  rpm: { min: 0, max: 10000 },
  threadsLimit: { min: 0, max: 1000 },
  totalRequests: { min: 0 },
  customKey: { min: 16, max: 64 },
  expirationValue: { min: 1 }
};

// Success notification component
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
          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
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
            <CopyButton text={apiKey.id} variant="button" />
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

// Preset selector component
const PresetSelector: React.FC<{ onSelect: (preset: PresetConfig) => void }> = ({ onSelect }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
      Quick Presets
    </h3>
    
    <div className="space-y-3">
      {PRESETS.map((preset) => {
        const Icon = preset.icon;
        return (
          <motion.button
            key={preset.name}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(preset)}
            className={`w-full p-4 text-left rounded-xl bg-gradient-to-r ${preset.color} text-white hover:shadow-lg transition-all duration-200`}
          >
            <div className="flex items-center space-x-3">
              <Icon className="w-6 h-6" />
              <div className="flex-1">
                <div className="font-semibold">{preset.name}</div>
                <div className="text-sm opacity-90">{preset.description}</div>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  </div>
);

// Configuration preview component
const ConfigPreview: React.FC<{ formData: FormData }> = ({ formData }) => {
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
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Configuration Preview
      </h3>
      
      <div className="space-y-4">
        {previewItems.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
            <span className="text-gray-600 dark:text-gray-400">{label}:</span>
            <span className="font-medium text-gray-900 dark:text-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const CreateKey: React.FC = () => {
  const { createKeyForm, setCreateKeyForm, addApiKey } = useStore();
  const [formData, setFormData] = useState<FormData>(createKeyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync form data with store
  useEffect(() => {
    const { expirationValue, expirationUnit, ...rest } = formData;
    const updatedData = {
      ...rest,
      expiration: expirationValue + expirationUnit,
      expirationValue,
      expirationUnit
    };
    setCreateKeyForm(updatedData);
  }, [formData, setCreateKeyForm]);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Name validation
    const nameError = validateApiKeyName(formData.name);
    if (nameError) newErrors.name = nameError;

    // RPM validation
    if (formData.rpm < VALIDATION_RULES.rpm.min || formData.rpm > VALIDATION_RULES.rpm.max) {
      newErrors.rpm = `RPM must be between ${VALIDATION_RULES.rpm.min} and ${VALIDATION_RULES.rpm.max} (0 = unlimited)`;
    }

    // Thread limit validation
    if (formData.threadsLimit < VALIDATION_RULES.threadsLimit.min || formData.threadsLimit > VALIDATION_RULES.threadsLimit.max) {
      newErrors.threadsLimit = `Thread limit must be between ${VALIDATION_RULES.threadsLimit.min} and ${VALIDATION_RULES.threadsLimit.max} (0 = unlimited)`;
    }

    // Total requests validation
    if (formData.totalRequests < VALIDATION_RULES.totalRequests.min) {
      newErrors.totalRequests = 'Total requests must be 0 or greater (0 = unlimited)';
    }

    // Expiration validation
    if (!formData.expirationValue || parseInt(formData.expirationValue, 10) < VALIDATION_RULES.expirationValue.min) {
      newErrors.expiration = 'Expiration value must be at least 1';
    }

    // Custom key validation
    if (formData.customKey) {
      const customKeyError = validateCustomKey(formData.customKey);
      if (customKeyError) newErrors.customKey = customKeyError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleInputChange = useCallback((field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const applyPreset = useCallback((preset: PresetConfig) => {
    setFormData(prev => ({
      ...prev,
      ...preset.data,
      expiration: preset.data.expirationValue + preset.data.expirationUnit
    }));
    setErrors({});
    toast.success(`Applied ${preset.name} preset`);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setIsLoading(true);

    try {
      const { expirationValue: _expirationValue, expirationUnit: _expirationUnit, ...submitData } = formData;
      const response = await apiService.createKey(submitData);
      
      setCreatedKey(response.data);
      addApiKey(response.data);
      toast.success('API key created successfully!');
      
      // Reset form partially
      setFormData(prev => ({
        ...prev,
        name: '',
        customKey: ''
      }));
      setErrors({});
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const responseError = error as { response?: { data?: { errors?: Record<string, string>; error?: string } } };
        if (responseError.response?.data?.errors) {
          setErrors(responseError.response.data.errors);
          toast.error('Please fix the form errors');
        } else {
          toast.error(responseError.response?.data?.error || 'Failed to create API key');
        }
      } else {
        toast.error('Failed to create API key');
      }
    } finally {
      setIsLoading(false);
    }
  }, [formData, validateForm, addApiKey]);

  const resetForm = useCallback(() => {
    const defaultForm: FormData = {
      name: '',
      rpm: 100,
      threadsLimit: 10,
      totalRequests: 1000,
      customKey: '',
      expiration: '30d',
      expirationValue: '30',
      expirationUnit: 'd'
    };
    setFormData(defaultForm);
    setCreatedKey(null);
    setErrors({});
    toast.success('Form reset');
  }, []);

  return (
    <div className="space-y-8">
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
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={resetForm}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormInput
                    label="Key Name"
                    value={formData.name}
                    onChange={(value) => handleInputChange('name', value)}
                    placeholder="My API Key"
                    error={errors.name}
                    required
                  />

                  <FormInput
                    label="Custom Key (Optional)"
                    value={formData.customKey}
                    onChange={(value) => handleInputChange('customKey', value)}
                    placeholder="Leave empty for auto-generation"
                    error={errors.customKey}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Limits & Permissions</h3>
                
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
                  />

                  <FormInput
                    label="Total Requests"
                    value={formData.totalRequests}
                    onChange={(value) => handleInputChange('totalRequests', value)}
                    type="number"
                    min={0}
                    error={errors.totalRequests}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <Clock className="w-4 h-4 mr-2 text-green-500" />
                  Expiration
                </label>
                <div className="flex space-x-3">
                  <FormInput
                    label=""
                    value={formData.expirationValue}
                    onChange={(value) => handleInputChange('expirationValue', value)}
                    type="number"
                    min={1}
                    error={errors.expiration}
                  />
                  <select
                    value={formData.expirationUnit}
                    onChange={(e) => handleInputChange('expirationUnit', e.target.value)}
                    className="px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200"
                  >
                    {EXPIRATION_UNITS.map(unit => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <ActionButton
                type="submit"
                onClick={() => {}}
                disabled={!formData.name.trim()}
                loading={isLoading}
                variant="primary"
                size="lg"
                fullWidth
                icon={Key}
              >
                {isLoading ? 'Creating API Key...' : 'Create API Key'}
              </ActionButton>
            </form>
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
            <ConfigPreview formData={formData} />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CreateKey;