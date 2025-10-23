import toast, { Toast } from 'react-hot-toast';

/**
 * Smart Toast Notification System
 *
 * Reduces notification spam by:
 * - Deduplicating similar messages
 * - Rate limiting notifications
 * - Prioritizing important messages
 * - Batching related notifications
 * - Using silent updates for background operations
 */

// Notification importance levels
export enum ToastPriority {
  SILENT = 0,      // No toast, silent update
  LOW = 1,         // Informational, can be skipped if spam
  MEDIUM = 2,      // Important but not critical
  HIGH = 3,        // Critical user action required
}

interface ToastConfig {
  priority: ToastPriority;
  duration?: number;
  groupKey?: string;  // For batching similar notifications
  showCount?: boolean; // Show count for batched notifications
}

interface ToastState {
  lastShown: number;
  count: number;
  timeoutId?: NodeJS.Timeout;
}

class SmartToastManager {
  private toastHistory: Map<string, ToastState> = new Map();
  private readonly MIN_INTERVAL = 3000; // 3 seconds between similar toasts
  private readonly BATCH_DELAY = 1000;  // Batch within 1 second
  private batchedToasts: Map<string, { count: number; message: string; type: 'success' | 'error' }> = new Map();

  /**
   * Show a success notification (only for important operations)
   */
  success(message: string, config: Partial<ToastConfig> = {}) {
    const defaultConfig: ToastConfig = {
      priority: ToastPriority.MEDIUM,
      duration: 3000,
      ...config,
    };

    this.show(message, 'success', defaultConfig);
  }

  /**
   * Show an error notification (always shown, high priority)
   */
  error(message: string, config: Partial<ToastConfig> = {}) {
    const defaultConfig: ToastConfig = {
      priority: ToastPriority.HIGH,
      duration: 5000,
      ...config,
    };

    this.show(message, 'error', defaultConfig);
  }

  /**
   * Show an informational notification (low priority, can be skipped)
   */
  info(message: string, config: Partial<ToastConfig> = {}) {
    const defaultConfig: ToastConfig = {
      priority: ToastPriority.LOW,
      duration: 2000,
      ...config,
    };

    this.show(message, 'success', defaultConfig);
  }

  /**
   * Silent operation - no toast, just returns success status
   */
  silent(message: string): boolean {
    console.log(`[Silent] ${message}`);
    return true;
  }

  /**
   * Batch similar notifications together
   */
  private batch(message: string, type: 'success' | 'error', groupKey: string, showCount: boolean) {
    const existing = this.batchedToasts.get(groupKey);

    if (existing) {
      existing.count++;
      clearTimeout(this.toastHistory.get(groupKey)?.timeoutId);
    } else {
      this.batchedToasts.set(groupKey, { count: 1, message, type });
    }

    const timeoutId = setTimeout(() => {
      const batched = this.batchedToasts.get(groupKey);
      if (batched) {
        const displayMessage = showCount && batched.count > 1
          ? `${message} (${batched.count})`
          : message;

        this.showToast(displayMessage, batched.type, 3000);
        this.batchedToasts.delete(groupKey);
      }
    }, this.BATCH_DELAY);

    const state = this.toastHistory.get(groupKey);
    if (state) {
      state.timeoutId = timeoutId;
    } else {
      this.toastHistory.set(groupKey, { lastShown: Date.now(), count: 1, timeoutId });
    }
  }

  /**
   * Core show method with intelligent filtering
   */
  private show(message: string, type: 'success' | 'error', config: ToastConfig) {
    // Silent notifications - don't show toast
    if (config.priority === ToastPriority.SILENT) {
      return this.silent(message);
    }

    const toastKey = config.groupKey || `${type}-${message}`;
    const now = Date.now();
    const state = this.toastHistory.get(toastKey);

    // Check if we should batch this notification
    if (config.groupKey && config.showCount) {
      return this.batch(message, type, config.groupKey, config.showCount);
    }

    // High priority - always show
    if (config.priority === ToastPriority.HIGH) {
      this.showToast(message, type, config.duration || 5000);
      this.toastHistory.set(toastKey, { lastShown: now, count: 1 });
      return;
    }

    // Rate limiting for non-critical notifications
    if (state && (now - state.lastShown) < this.MIN_INTERVAL) {
      // Skip if shown recently and low priority
      if (config.priority === ToastPriority.LOW) {
        console.log(`[Skipped] ${message}`);
        return;
      }

      // For medium priority, update count but don't spam
      state.count++;
      if (state.count > 3) {
        console.log(`[Throttled] ${message} (shown ${state.count} times)`);
        return;
      }
    }

    this.showToast(message, type, config.duration || 3000);
    this.toastHistory.set(toastKey, { lastShown: now, count: state?.count || 1 });
  }

  /**
   * Actually display the toast
   */
  private showToast(message: string, type: 'success' | 'error', duration: number) {
    const options = {
      duration,
      position: 'top-right' as const,
      style: {
        borderRadius: '10px',
        background: type === 'error' ? '#ef4444' : '#10b981',
        color: '#fff',
      },
    };

    if (type === 'error') {
      toast.error(message, options);
    } else {
      toast.success(message, options);
    }
  }

  /**
   * Clear all toasts
   */
  dismiss() {
    toast.dismiss();
  }

  /**
   * Clear history (useful for testing or cleanup)
   */
  clearHistory() {
    this.toastHistory.clear();
    this.batchedToasts.clear();
  }
}

// Singleton instance
export const smartToast = new SmartToastManager();

/**
 * Notification categories with predefined configurations
 */
export const notifications = {
  // Critical operations - always show
  auth: {
    loginSuccess: () => smartToast.success('Welcome back!', { priority: ToastPriority.HIGH }),
    loginError: (msg: string) => smartToast.error(msg, { priority: ToastPriority.HIGH }),
    logoutSuccess: () => smartToast.silent('Logged out'), // Silent, navigation is enough feedback
  },

  // API Key operations
  apiKey: {
    created: () => smartToast.success('API key created successfully', { priority: ToastPriority.HIGH }),
    updated: () => smartToast.success('API key updated', { priority: ToastPriority.MEDIUM }),
    deleted: (name: string) => smartToast.success(`Deleted "${name}"`, { priority: ToastPriority.MEDIUM }),
    copySuccess: () => smartToast.silent('Copied'), // Silent, visual feedback is enough
    copyError: () => smartToast.error('Failed to copy', { priority: ToastPriority.LOW }),
    createError: (msg: string) => smartToast.error(msg, { priority: ToastPriority.HIGH }),
    updateError: (msg: string) => smartToast.error(msg, { priority: ToastPriority.MEDIUM }),
    deleteError: (msg: string) => smartToast.error(msg, { priority: ToastPriority.MEDIUM }),
  },

  // Bulk operations - batch them
  bulk: {
    deleteSuccess: (count: number) => smartToast.success(
      `Deleted ${count} API key${count > 1 ? 's' : ''}`,
      { priority: ToastPriority.MEDIUM, groupKey: 'bulk-delete', showCount: true }
    ),
    deleteError: (count: number) => smartToast.error(
      `Failed to delete ${count} key${count > 1 ? 's' : ''}`,
      { priority: ToastPriority.HIGH }
    ),
  },

  // Data operations - silent unless error
  data: {
    exportSuccess: () => smartToast.silent('Exported'), // Download is enough feedback
    exportError: () => smartToast.error('No data to export', { priority: ToastPriority.LOW }),
    importSuccess: () => smartToast.success('Data imported', { priority: ToastPriority.MEDIUM }),
  },

  // Form operations - mostly silent
  form: {
    resetSuccess: () => smartToast.silent('Form reset'), // Visual feedback is enough
    validationError: () => smartToast.error('Please fix errors', { priority: ToastPriority.MEDIUM }),
    presetApplied: () => smartToast.silent('Preset applied'), // Visual feedback is enough
  },

  // Filter operations - silent
  filter: {
    saved: () => smartToast.silent('Filter saved'), // Visual feedback is enough
    applied: () => smartToast.silent('Filter applied'),
    deleted: () => smartToast.silent('Filter deleted'),
    cleared: () => smartToast.silent('Filters cleared'),
  },

  // Logs operations
  logs: {
    copySuccess: () => smartToast.silent('Log copied'), // Visual feedback is enough
    copyError: () => smartToast.error('Failed to copy', { priority: ToastPriority.LOW }),
    exportSuccess: () => smartToast.silent('Logs exported'),
    exportError: () => smartToast.error('No logs to export', { priority: ToastPriority.LOW }),
    streamingEnabled: () => smartToast.silent('Streaming enabled'), // Visual indicator is enough
    streamingDisabled: () => smartToast.silent('Streaming paused'),
    loadError: (msg: string) => smartToast.error(msg, { priority: ToastPriority.MEDIUM }),
  },

  // System messages
  system: {
    offline: () => smartToast.error('Connection lost', { priority: ToastPriority.HIGH }),
    online: () => smartToast.success('Connection restored', { priority: ToastPriority.MEDIUM }),
    error: (msg: string) => smartToast.error(msg, { priority: ToastPriority.HIGH }),
  },
};

export default smartToast;
