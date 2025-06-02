import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Settings, Clock, Zap, Users, Copy, CheckCircle, RefreshCw, Save } from 'lucide-react';
import { CreateKeyRequest, APIKey } from '../types';
import apiService from '../services/api';
import toast from 'react-hot-toast';

interface FormData extends CreateKeyRequest {
  expirationValue: string;
  expirationUnit: string;
}

const CreateKey: React.FC = () => {
  const [formData, setFormData] = useState<FormData>(() => {
    const saved = localStorage.getItem('createKeyForm');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fall back to default if parsing fails
      }
    }
    return {
      name: '',
      rpm: 100,
      threadsLimit: 10,
      totalRequests: 1000,
      customKey: '',
      expiration: '30d',
      expirationValue: '30',
      expirationUnit: 'd'
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKey | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [
    {
      name: 'Development',
      icon: Settings,
      data: { rpm: 50, threadsLimit: 5, totalRequests: 500, expirationValue: '7', expirationUnit: 'd' }
    },
    {
      name: 'Production',
      icon: Zap,
      data: { rpm: 1000, threadsLimit: 50, totalRequests: 100000, expirationValue: '1', expirationUnit: 'y' }
    },
    {
      name: 'Testing',
      icon: RefreshCw,
      data: { rpm: 10, threadsLimit: 2, totalRequests: 100, expirationValue: '1', expirationUnit: 'd' }
    }
  ];

  const expirationUnits = [
    { value: 'm', label: 'Minutes' },
    { value: 'h', label: 'Hours' },
    { value: 'd', label: 'Days' },
    { value: 'w', label: 'Weeks' },
    { value: 'mo', label: 'Months' },
    { value: 'y', label: 'Years' }
  ];

  useEffect(() => {
    const { expirationValue, expirationUnit, ...rest } = formData;
    const updatedData = {
      ...rest,
      expiration: expirationValue + expirationUnit,
      expirationValue,
      expirationUnit
    };
    localStorage.setItem('createKeyForm', JSON.stringify(updatedData));
  }, [formData]);

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'expirationValue' || field === 'expirationUnit' 
        ? { expiration: field === 'expirationValue' 
            ? value + prev.expirationUnit 
            : prev.expirationValue + value }
        : {})
    }));
  };

  const applyPreset = (preset: typeof presets[0]) => {
    setFormData(prev => ({
      ...prev,
      ...preset.data,
      expiration: preset.data.expirationValue + preset.data.expirationUnit
    }));
    toast.success(`Applied ${preset.name} preset`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { expirationValue, expirationUnit, ...submitData } = formData;
      const response = await apiService.createKey(submitData);
      setCreatedKey(response.data);
      toast.success('API key created successfully!');
      
      setFormData(prev => ({
        ...prev,
        name: '',
        customKey: ''
      }));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create API key');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
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
    localStorage.removeItem('createKeyForm');
    toast.success('Form reset');
  };

  return (
    <div className="space-y-8">
      {createdKey && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
        >
          <div className="flex items-center space-x-3 mb-4">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-semibold text-green-800 dark:text-green-400">
              API Key Created Successfully!
            </h3>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                API Key
              </label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-white dark:bg-gray-800 px-3 py-2 rounded border text-sm font-mono">
                  {createdKey.id}
                </code>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => copyToClipboard(createdKey.id)}
                  className="btn-secondary p-2"
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </motion.button>
              </div>
            </div>
            
            {createdKey.name && (
              <div>
                <span className="text-sm text-green-700 dark:text-green-400">Name: </span>
                <span className="font-medium">{createdKey.name}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <Key className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Create New API Key
                </h2>
              </div>
              
              <div className="flex space-x-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={resetForm}
                  className="btn-secondary text-sm px-3 py-1"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Reset
                </motion.button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="input-field"
                    placeholder="My API Key"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Custom Key (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.customKey}
                    onChange={(e) => handleInputChange('customKey', e.target.value)}
                    className="input-field"
                    placeholder="Leave empty for auto-generation"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Zap className="w-4 h-4 inline mr-1" />
                    Requests Per Minute
                  </label>
                  <input
                    type="number"
                    value={formData.rpm}
                    onChange={(e) => handleInputChange('rpm', parseInt(e.target.value) || 0)}
                    className="input-field"
                    min="0"
                    max="10000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Users className="w-4 h-4 inline mr-1" />
                    Thread Limit
                  </label>
                  <input
                    type="number"
                    value={formData.threadsLimit}
                    onChange={(e) => handleInputChange('threadsLimit', parseInt(e.target.value) || 0)}
                    className="input-field"
                    min="0"
                    max="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Total Requests
                  </label>
                  <input
                    type="number"
                    value={formData.totalRequests}
                    onChange={(e) => handleInputChange('totalRequests', parseInt(e.target.value) || 0)}
                    className="input-field"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Expiration
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    value={formData.expirationValue}
                    onChange={(e) => handleInputChange('expirationValue', e.target.value)}
                    className="input-field flex-1"
                    min="1"
                  />
                  <select
                    value={formData.expirationUnit}
                    onChange={(e) => handleInputChange('expirationUnit', e.target.value)}
                    className="input-field"
                  >
                    {expirationUnits.map(unit => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading || !formData.name.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="loading-spinner mr-2"></div>
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
            className="card p-6"
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
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => applyPreset(preset)}
                    className="w-full p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {preset.name}
                      </span>
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
            className="card p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Preview
            </h3>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Name:</span>
                <span className="font-medium">{formData.name || 'Untitled'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">RPM:</span>
                <span className="font-medium">{formData.rpm}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Threads:</span>
                <span className="font-medium">{formData.threadsLimit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total Requests:</span>
                <span className="font-medium">{formData.totalRequests.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                <span className="font-medium">{formData.expirationValue} {expirationUnits.find(u => u.value === formData.expirationUnit)?.label}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CreateKey;