import React, { memo, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw, CheckCircle, Copy, TrendingUp, Plus, X } from 'lucide-react';

// Enhanced Loading Spinner with better memory management
export interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  overlay?: boolean;
}

export const LoadingSpinner = memo<LoadingSpinnerProps>(({ 
  message = 'Loading...', 
  size = 'md',
  overlay = false 
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  const content = (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className={`${sizeClasses[size]} border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin`}></div>
      <p className="text-gray-600 dark:text-gray-400">{message}</p>
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          {content}
        </div>
      </div>
    );
  }

  return content;
});

LoadingSpinner.displayName = 'LoadingSpinner';

// Enhanced Error Display
export interface ErrorDisplayProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  showOfflineIndicator?: boolean;
  variant?: 'error' | 'warning' | 'info';
}

export const ErrorDisplay = memo<ErrorDisplayProps>(({ 
  title, 
  message, 
  onRetry, 
  retryLabel = 'Try Again',
  showOfflineIndicator = false,
  variant = 'error'
}) => {
  const variants = {
    error: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400',
    warning: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400',
    info: 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
  };

  return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className={`p-4 rounded-lg text-center max-w-md ${variants[variant]}`}>
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <p className="font-medium">{title}</p>
        <p className="text-sm mt-1">{message}</p>
        {showOfflineIndicator && (
          <div className="flex items-center justify-center mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span>You appear to be offline</span>
          </div>
        )}
      </div>
      {onRetry && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{retryLabel}</span>
        </motion.button>
      )}
    </div>
  );
});

ErrorDisplay.displayName = 'ErrorDisplay';

// Enhanced Form Input
export interface FormInputProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'password' | 'email';
  placeholder?: string;
  error?: string;
  required?: boolean;
  min?: number;
  max?: number;
  icon?: React.ElementType;
  disabled?: boolean;
  autoComplete?: string;
}

export const FormInput = memo<FormInputProps>(({ 
  label, 
  value, 
  onChange, 
  type = 'text', 
  placeholder, 
  error, 
  required = false,
  min,
  max,
  icon: Icon,
  disabled = false,
  autoComplete
}) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
    onChange(newValue);
  }, [onChange, type]);

  return (
    <div className="w-full">
      <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        {Icon && <Icon className="w-4 h-4 mr-2 text-gray-500" />}
        {label} {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoComplete={autoComplete}
        className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed ${
          error 
            ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
            : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
        }`}
        placeholder={placeholder}
        min={min}
        max={max}
      />
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center mt-2 text-red-500 text-sm"
          >
            <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

FormInput.displayName = 'FormInput';

// Enhanced Action Button with loading state management
export interface ActionButtonProps {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ElementType;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export const ActionButton = memo<ActionButtonProps>(({ 
  onClick, 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false, 
  loading = false,
  icon: Icon,
  fullWidth = false,
  type = 'button'
}) => {
  const [isLoading, setIsLoading] = useState(loading);

  useEffect(() => {
    setIsLoading(loading);
  }, [loading]);

  const handleClick = useCallback(async () => {
    if (disabled || isLoading) return;
    
    try {
      setIsLoading(true);
      await onClick();
    } catch (error) {
      console.error('Button action failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onClick, disabled, isLoading]);

  const baseClasses = 'font-medium rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white focus:ring-blue-500',
    secondary: 'bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white focus:ring-red-500',
    success: 'bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white focus:ring-green-500'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <motion.button
      type={type}
      whileHover={{ scale: disabled || isLoading ? 1 : 1.05 }}
      whileTap={{ scale: disabled || isLoading ? 1 : 0.95 }}
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''}`}
    >
      {isLoading ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : (
        Icon && <Icon className="w-4 h-4" />
      )}
      <span>{children}</span>
    </motion.button>
  );
});

ActionButton.displayName = 'ActionButton';

// Enhanced Status Badge
export interface StatusBadgeProps {
  status: 'active' | 'expired' | 'inactive' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export const StatusBadge = memo<StatusBadgeProps>(({ status, children, size = 'md', pulse = false }) => {
  const statusClasses = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    expired: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    inactive: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1 text-sm'
  };

  return (
    <span className={`rounded-full font-medium ${statusClasses[status]} ${sizeClasses[size]} ${pulse ? 'animate-pulse' : ''}`}>
      {children}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

// Enhanced Metric Card
export interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  trend?: number;
  color?: string;
  isLoading?: boolean;
  description?: string;
  onClick?: () => void;
}

export const MetricCard = memo<MetricCardProps>(({ 
  icon: Icon, 
  label, 
  value, 
  trend, 
  color = 'blue', 
  isLoading = false,
  description,
  onClick
}) => {
  const Component = onClick ? motion.button : motion.div;
  const interactionProps = onClick ? {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    onClick
  } : {
    whileHover: { scale: 1.01 }
  };

  return (
    <Component
      {...interactionProps}
      className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={`p-2 rounded-md bg-${color}-100 dark:bg-${color}-900/20`}>
            <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`w-3 h-3 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        {isLoading ? (
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        ) : (
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        )}
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        )}
      </div>
    </Component>
  );
});

MetricCard.displayName = 'MetricCard';

// Enhanced Copy Button with better feedback
export interface CopyButtonProps {
  text: string;
  onCopy?: (success: boolean) => void;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
}

export const CopyButton = memo<CopyButtonProps>(({ 
  text, 
  onCopy, 
  variant = 'icon',
  size = 'md' 
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopy?.(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopy?.(false);
    }
  }, [text, onCopy]);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const buttonSizeClasses = {
    sm: 'px-2 py-1',
    md: 'px-3 py-2',
    lg: 'px-4 py-3'
  };

  if (variant === 'button') {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleCopy}
        className={`bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center space-x-2 ${buttonSizeClasses[size]}`}
      >
        {copied ? (
          <CheckCircle className={`text-green-500 ${sizeClasses[size]}`} />
        ) : (
          <Copy className={sizeClasses[size]} />
        )}
        <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleCopy}
      className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      {copied ? (
        <CheckCircle className={`text-green-500 ${sizeClasses[size]}`} />
      ) : (
        <Copy className={sizeClasses[size]} />
      )}
    </motion.button>
  );
});

CopyButton.displayName = 'CopyButton';

// Enhanced Empty State
export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
  size?: 'sm' | 'md' | 'lg';
}

export const EmptyState = memo<EmptyStateProps>(({ 
  title, 
  description, 
  actionLabel, 
  onAction, 
  icon: Icon = Plus,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: { container: 'py-8', icon: 'w-8 h-8', title: 'text-base', description: 'text-sm' },
    md: { container: 'py-12', icon: 'w-12 h-12', title: 'text-lg', description: 'text-sm' },
    lg: { container: 'py-16', icon: 'w-16 h-16', title: 'text-xl', description: 'text-base' }
  };

  return (
    <div className={`text-center ${sizeClasses[size].container}`}>
      <div className="space-y-4">
        <Icon className={`${sizeClasses[size].icon} text-gray-400 mx-auto mb-4`} />
        <div className="text-gray-500 dark:text-gray-400">
          <p className={`${sizeClasses[size].title} font-medium mb-2`}>{title}</p>
          <p className={sizeClasses[size].description}>{description}</p>
        </div>
        {actionLabel && onAction && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAction}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>{actionLabel}</span>
          </motion.button>
        )}
      </div>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

// Enhanced Modal component
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnOverlay?: boolean;
}

export const Modal = memo<ModalProps>(({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlay = true
}) => {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={closeOnOverlay ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${sizeClasses[size]} p-6`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

Modal.displayName = 'Modal';

// Utility functions
export const formatValue = (value: number): string => {
  if (value === 0) return 'Unlimited';
  return value.toLocaleString();
};

export const calculateUsagePercentage = (used: number, total: number): number => {
  if (total === 0) return 0;
  return Math.min((used / total) * 100, 100);
};

export const formatUsageDisplay = (used: number, total: number) => {
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

// Validation utilities
export const validateApiKeyName = (name: string): string | null => {
  if (!name.trim()) return 'API key name is required';
  if (name.length < 2) return 'API key name must be at least 2 characters';
  if (name.length > 50) return 'API key name must be less than 50 characters';
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
    return 'API key name can only contain letters, numbers, spaces, hyphens, and underscores';
  }
  return null;
};

export const validateCustomKey = (key: string): string | null => {
  if (!key) return null;
  if (key.length < 16) return 'Custom key must be at least 16 characters';
  if (key.length > 64) return 'Custom key must be less than 64 characters';
  if (!/^[a-zA-Z0-9]+$/.test(key)) return 'Custom key can only contain letters and numbers';
  return null;
};