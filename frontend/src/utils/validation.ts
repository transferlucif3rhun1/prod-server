// src/utils/validation.ts
export type Validator<T> = (value: T) => string | null;

export const createValidator = <T>(
  ...validators: Validator<T>[]
): Validator<T> => {
  return (value: T) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) return error;
    }
    return null;
  };
};

export const required = <T>(message = 'This field is required'): Validator<T> => {
  return (value: T) => {
    if (value === null || value === undefined || value === '') {
      return message;
    }
    if (typeof value === 'string' && !value.trim()) {
      return message;
    }
    return null;
  };
};

export const minLength = (min: number, message?: string): Validator<string> => {
  return (value: string) => {
    if (value && value.length < min) {
      return message || `Must be at least ${min} characters`;
    }
    return null;
  };
};

export const maxLength = (max: number, message?: string): Validator<string> => {
  return (value: string) => {
    if (value && value.length > max) {
      return message || `Must be less than ${max} characters`;
    }
    return null;
  };
};

export const pattern = (regex: RegExp, message: string): Validator<string> => {
  return (value: string) => {
    if (value && !regex.test(value)) {
      return message;
    }
    return null;
  };
};

export const min = (minimum: number, message?: string): Validator<number> => {
  return (value: number) => {
    if (value < minimum) {
      return message || `Must be at least ${minimum}`;
    }
    return null;
  };
};

export const max = (maximum: number, message?: string): Validator<number> => {
  return (value: number) => {
    if (value > maximum) {
      return message || `Must be less than ${maximum}`;
    }
    return null;
  };
};

export const email = (message = 'Invalid email format'): Validator<string> => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern(emailRegex, message);
};

export const alphanumeric = (message = 'Only letters and numbers allowed'): Validator<string> => {
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;
  return pattern(alphanumericRegex, message);
};

export const validateApiKeyName = createValidator(
  required('API key name is required'),
  minLength(2, 'API key name must be at least 2 characters'),
  maxLength(50, 'API key name must be less than 50 characters'),
  pattern(/^[a-zA-Z0-9\s\-_]+$/, 'Only letters, numbers, spaces, hyphens, and underscores allowed')
);

export const validateCustomKey = (value: string) => {
  if (!value) return null;
  
  const validator = createValidator(
    minLength(16, 'Custom key must be at least 16 characters'),
    maxLength(64, 'Custom key must be less than 64 characters'),
    alphanumeric('Custom key can only contain letters and numbers')
  );
  
  return validator(value);
};

export const validateExpiration = (value: string, unit: string) => {
  const numValue = parseInt(value, 10);
  
  if (isNaN(numValue) || numValue < 1) {
    return 'Expiration value must be at least 1';
  }
  
  const maxValues: Record<string, number> = {
    m: 525600,
    h: 8760,
    d: 365,
    w: 52,
    mo: 12,
    y: 5
  };
  
  if (numValue > (maxValues[unit] || 365)) {
    return `Maximum value for ${unit} is ${maxValues[unit]}`;
  }
  
  return null;
};

// src/utils/formatters.ts
export const formatters = {
  number: (value: number): string => {
    if (value === 0) return 'Unlimited';
    return value.toLocaleString();
  },

  bytes: (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  uptime: (seconds: number): string => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  },

  date: (date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string => {
    const d = new Date(date);
    
    if (format === 'relative') {
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }
    
    if (format === 'long') {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  },

  status: (status: string): { label: string; color: string; emoji: string } => {
    const statusMap: Record<string, { label: string; color: string; emoji: string }> = {
      active: { label: 'Active', color: 'bg-green-100 text-green-800 border-green-200', emoji: '✅' },
      expired: { label: 'Expired', color: 'bg-red-100 text-red-800 border-red-200', emoji: '❌' },
      inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-800 border-gray-200', emoji: '⚪' },
    };
    
    return statusMap[status.toLowerCase()] || statusMap.inactive;
  },

  logLevel: (level: string): { color: string; emoji: string } => {
    const levelMap: Record<string, { color: string; emoji: string }> = {
      INFO: { color: 'text-blue-600', emoji: 'ℹ️' },
      WARN: { color: 'text-yellow-600', emoji: '⚠️' },
      ERROR: { color: 'text-red-600', emoji: '❌' },
      DEBUG: { color: 'text-gray-600', emoji: '🐞' },
    };
    
    return levelMap[level] || levelMap.INFO;
  },

  usage: (used: number, total: number): { text: string; percentage: number | null; color: string } => {
    if (total === 0) {
      return {
        text: `${used.toLocaleString()} used (Unlimited)`,
        percentage: null,
        color: 'bg-blue-500'
      };
    }
    
    const percentage = Math.min((used / total) * 100, 100);
    const color = percentage > 80 ? 'bg-red-500' : percentage > 60 ? 'bg-yellow-500' : 'bg-green-500';
    
    return {
      text: `${used.toLocaleString()}/${total.toLocaleString()}`,
      percentage,
      color
    };
  },

  expiration: (expirationDate: string): { 
    formatted: string; 
    daysLeft: number; 
    color: string; 
    isExpired: boolean 
  } => {
    const now = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const isExpired = daysLeft <= 0;
    
    let color = 'bg-blue-100 text-blue-800 border-blue-200';
    if (isExpired) color = 'bg-red-100 text-red-800 border-red-200';
    else if (daysLeft <= 3) color = 'bg-orange-100 text-orange-800 border-orange-200';
    else if (daysLeft <= 7) color = 'bg-yellow-100 text-yellow-800 border-yellow-200';
    
    let formatted = '';
    if (isExpired) formatted = 'Expired';
    else if (daysLeft === 1) formatted = 'Expires today';
    else if (daysLeft <= 7) formatted = `${daysLeft} days left`;
    else formatted = `Expires ${formatters.date(expDate, 'short')}`;
    
    return { formatted, daysLeft, color, isExpired };
  }
};