import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Key, Clock, Zap, Users, Copy, CheckCircle, RefreshCw, 
  AlertCircle, Sparkles, Code, Shield, Timer 
} from 'lucide-react';
import { CreateKeyRequest, APIKey } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import { copyToClipboard } from '../utils';
import toast from 'react-hot-toast';

interface FormData extends CreateKeyRequest {
  expirationValue: string;
  expirationUnit: string;
}

const CreateKey: React.FC = () => {
  const { createKeyForm, setCreateKeyForm, addApiKey } = useStore();
  const [formData, setFormData] = useState<FormData>(createKeyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const presets = [
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

  const expirationUnits = [
    { value: 'm', label: 'Minutes', icon: Timer },
    { value: 'h', label: 'Hours', icon: Clock },
    { value: 'd', label: 'Days', icon: Clock },
    { value: 'w', label: 'Weeks', icon: Clock },
    { value: 'mo', label: 'Months', icon: Clock },
    { value: 'y', label: 'Years', icon: Clock }
  ];

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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'API key name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (formData.rpm < 0 || formData.rpm > 10000) {
      newErrors.rpm = 'RPM must be between 0 and 10000 (0 = unlimited)';
    }

    if (formData.threadsLimit < 0 || formData.threadsLimit > 1000) {
      newErrors.threadsLimit = 'Thread limit must be between 0 and 1000 (0 = unlimited)';
    }

    if (formData.totalRequests < 0) {
      newErrors.totalRequests = 'Total requests must be 0 or greater (0 = unlimited)';
    }

    if (!formData.expirationValue || parseInt(formData.expirationValue, 10) < 1) {
      newErrors.expiration = 'Expiration value must be at least 1';
    }

    if (formData.customKey && (formData.customKey.length < 16 || formData.customKey.length > 64)) {
      newErrors.customKey = 'Custom key must be between 16 and 64 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const applyPreset = (preset: typeof presets[0]) => {
    setFormData(prev => ({
      ...prev,
      ...preset.data,
      expiration: preset.data.expirationValue + preset.data.expirationUnit
    }));
    setErrors({});
    toast.success(`Applied ${preset.name} preset`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setIsLoading(true);

    try {
      const { expirationValue, expirationUnit, ...submitData } = formData;
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
  };

  const handleCopyToClipboard = async (text: string) => {
    try {
      const success = await copyToClipboard(text);
      if (success) {
        setCopied(true);
        toast.success('Copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.error('Failed to copy to clipboard');
      }
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const resetForm = () => {
    const defaultForm = {
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
  };

  const getUnitDisplayName = (unit: string) => {
    const unitObj = expirationUnits.find(u => u.value === unit);
    return unitObj?.label || unit;
  };

  const formatValue = (value: number): string => {
    if (value === 0) {
      return 'Unlimited';
    }
    return value.toLocaleString();
  };

  return (
    <div className="space-y-8">
      <AnimatePresence>
        {createdKey && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 p-6"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-100 dark:bg-green-800/20 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="relative">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-green-500 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-white" />
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
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                    API Key
                  </label>
                  <div className="flex items-center space-x-3">
                    <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-700 p-3">
                      <code className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                        {createdKey.id}
                      </code>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleCopyToClipboard(createdKey.id)}
                      className="px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                    >
                      {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </motion.button>
                  </div>
                </div>
                
                {createdKey.name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-700 dark:text-green-400">Name:</span>
                    <span className="font-medium text-green-800 dark:text-green-300">{createdKey.name}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
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
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Key Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
                        errors.name 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                      }`}
                      placeholder="My API Key"
                    />
                    {errors.name && (
                      <div className="flex items-center mt-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.name}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Custom Key (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.customKey}
                      onChange={(e) => handleInputChange('customKey', e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
                        errors.customKey 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                      }`}
                      placeholder="Leave empty for auto-generation"
                    />
                    {errors.customKey && (
                      <div className="flex items-center mt-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.customKey}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Limits & Permissions</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      <Zap className="w-4 h-4 mr-2 text-yellow-500" />
                      Requests Per Minute
                    </label>
                    <input
                      type="number"
                      value={formData.rpm}
                      onChange={(e) => handleInputChange('rpm', parseInt(e.target.value) || 0)}
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
                        errors.rpm 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                      }`}
                      min="0"
                      max="10000"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">0 = Unlimited</p>
                    {errors.rpm && (
                      <div className="flex items-center mt-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.rpm}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      <Users className="w-4 h-4 mr-2 text-blue-500" />
                      Thread Limit
                    </label>
                    <input
                      type="number"
                      value={formData.threadsLimit}
                      onChange={(e) => handleInputChange('threadsLimit', parseInt(e.target.value) || 0)}
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
                        errors.threadsLimit 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                      }`}
                      min="0"
                      max="1000"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">0 = Unlimited</p>
                    {errors.threadsLimit && (
                      <div className="flex items-center mt-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.threadsLimit}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Total Requests
                    </label>
                    <input
                      type="number"
                      value={formData.totalRequests}
                      onChange={(e) => handleInputChange('totalRequests', parseInt(e.target.value) || 0)}
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
                        errors.totalRequests 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                      }`}
                      min="0"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">0 = Unlimited</p>
                    {errors.totalRequests && (
                      <div className="flex items-center mt-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.totalRequests}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <Clock className="w-4 h-4 mr-2 text-green-500" />
                  Expiration
                </label>
                <div className="flex space-x-3">
                  <input
                    type="number"
                    value={formData.expirationValue}
                    onChange={(e) => handleInputChange('expirationValue', e.target.value)}
                    className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
                      errors.expiration 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                        : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                    }`}
                    min="1"
                  />
                  <select
                    value={formData.expirationUnit}
                    onChange={(e) => handleInputChange('expirationUnit', e.target.value)}
                    className="px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200"
                  >
                    {expirationUnits.map(unit => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.expiration && (
                  <div className="flex items-center mt-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.expiration}
                  </div>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={isLoading || !formData.name.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all duration-200 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    Creating API Key...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <Key className="w-5 h-5 mr-2" />
                    Create API Key
                  </div>
                )}
              </motion.button>
            </form>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Quick Presets
            </h3>
            
            <div className="space-y-3">
              {presets.map((preset) => {
                const Icon = preset.icon;
                return (
                  <motion.button
                    key={preset.name}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => applyPreset(preset)}
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Configuration Preview
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Name:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formData.name || 'Untitled'}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">RPM:</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatValue(formData.rpm)}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Threads:</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatValue(formData.threadsLimit)}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Total Requests:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatValue(formData.totalRequests)}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formData.expirationValue} {getUnitDisplayName(formData.expirationUnit)}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CreateKey;