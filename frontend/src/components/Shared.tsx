import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, CheckCircle, Copy, TrendingUp } from 'lucide-react';

export interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

 
export const LoadingSpinner = memo<LoadingSpinnerProps>(({ message = 'Loading...', size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className={`${sizeClasses[size]} border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin`}></div>
      <p className="text-gray-600 dark:text-gray-400">{message}</p>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

export interface ErrorDisplayProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  showOfflineIndicator?: boolean;
}

 
export const ErrorDisplay = memo<ErrorDisplayProps>(({ 
  title, 
  message, 
  onRetry, 
  retryLabel = 'Try Again',
  showOfflineIndicator = false 
}) => (
  <div className="flex flex-col items-center justify-center h-64 space-y-4">
    <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg text-center max-w-md">
      <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
      <p className="text-red-800 dark:text-red-400 font-medium">{title}</p>
      <p className="text-red-600 dark:text-red-500 text-sm mt-1">{message}</p>
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
));

ErrorDisplay.displayName = 'ErrorDisplay';

export interface FormInputProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'password';
  placeholder?: string;
  error?: string;
  required?: boolean;
  min?: number;
  max?: number;
  icon?: React.ElementType;
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
  icon: Icon 
}) => (
  <div>
    <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
      {Icon && <Icon className="w-4 h-4 mr-2 text-gray-500" />}
      {label} {required && '*'}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
      className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 ${
        error 
          ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
      }`}
      placeholder={placeholder}
      min={min}
      max={max}
    />
    {error && (
      <div className="flex items-center mt-2 text-red-500 text-sm">
        <AlertCircle className="w-4 h-4 mr-1" />
        {error}
      </div>
    )}
  </div>
));

FormInput.displayName = 'FormInput';

export interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ElementType;
}

 
export const ActionButton = memo<ActionButtonProps>(({ 
  onClick, 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false, 
  loading = false,
  icon: Icon 
}) => {
  const baseClasses = 'font-medium rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white',
    danger: 'bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white',
    success: 'bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
    >
      {loading ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : (
        Icon && <Icon className="w-4 h-4" />
      )}
      <span>{children}</span>
    </motion.button>
  );
});

ActionButton.displayName = 'ActionButton';

export interface StatusBadgeProps {
  status: 'active' | 'expired' | 'inactive';
  children: React.ReactNode;
}

 
export const StatusBadge = memo<StatusBadgeProps>(({ status, children }) => {
  const statusClasses = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    expired: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    inactive: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClasses[status]}`}>
      {children}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

export interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  trend?: number;
  color?: string;
  isLoading?: boolean;
}

 
export const MetricCard = memo<MetricCardProps>(({ 
  icon: Icon, 
  label, 
  value, 
  trend, 
  color = 'blue', 
  isLoading = false 
}) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 shadow-sm"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className={`p-1.5 rounded-md bg-${color}-100 dark:bg-${color}-900/20`}>
          <Icon className={`w-4 h-4 text-${color}-600 dark:text-${color}-400`} />
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
    <div className="mt-1">
      {isLoading ? (
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
      ) : (
        <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      )}
    </div>
  </motion.div>
));

MetricCard.displayName = 'MetricCard';

export interface CopyButtonProps {
  text: string;
  onCopy?: (success: boolean) => void;
  copied?: boolean;
}

 
export const CopyButton = memo<CopyButtonProps>(({ text, onCopy, copied = false }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy?.(true);
    } catch {
      onCopy?.(false);
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleCopy}
      className="px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
    >
      {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
    </motion.button>
  );
});

CopyButton.displayName = 'CopyButton';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

 
export const EmptyState = memo<EmptyStateProps>(({ 
  title, 
  description, 
  actionLabel, 
  onAction, 
  icon: Icon 
}) => (
  <div className="text-center py-12">
    <div className="space-y-4">
      {Icon && <Icon className="w-12 h-12 text-gray-400 mx-auto mb-4" />}
      <div className="text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium mb-2">{title}</p>
        <p className="text-sm">{description}</p>
      </div>
      {actionLabel && onAction && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onAction}
          className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
        >
          <span>{actionLabel}</span>
        </motion.button>
      )}
    </div>
  </div>
));

EmptyState.displayName = 'EmptyState';

export const formatValue = (value: number): string => {
  if (value === 0) {
    return 'Unlimited';
  }
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