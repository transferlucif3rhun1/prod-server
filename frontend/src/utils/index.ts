export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

export const getRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const target = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - target.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
};

export const validateApiKeyName = (name: string): string | null => {
  if (!name.trim()) {
    return 'API key name is required';
  }
  if (name.length < 2) {
    return 'API key name must be at least 2 characters';
  }
  if (name.length > 50) {
    return 'API key name must be less than 50 characters';
  }
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
    return 'API key name can only contain letters, numbers, spaces, hyphens, and underscores';
  }
  return null;
};

export const validateCustomKey = (key: string): string | null => {
  if (!key) return null;
  
  if (key.length < 16) {
    return 'Custom key must be at least 16 characters';
  }
  if (key.length > 64) {
    return 'Custom key must be less than 64 characters';
  }
  if (!/^[a-zA-Z0-9]+$/.test(key)) {
    return 'Custom key can only contain letters and numbers';
  }
  return null;
};

export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed, falling back to legacy method:', error);
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    textArea.style.zIndex = '-1';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      return true;
    }
  } catch (fallbackError) {
    console.error('Legacy copy method failed:', fallbackError);
  }

  if (window.prompt) {
    const userAction = window.prompt(
      'Unable to copy automatically. Please copy the text below manually:',
      text
    );
    return userAction !== null;
  }

  return false;
};

export const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

export const getStatusBadgeVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active':
      return 'success';
    case 'expired':
      return 'warning';
    case 'inactive':
      return 'error';
    default:
      return 'default';
  }
};