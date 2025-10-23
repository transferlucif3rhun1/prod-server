import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home, Bug, Copy, CheckCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  retryCount: number;
  copied: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
      copied: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = Math.random().toString(36).substr(2, 9);
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    console.group('🚨 Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    this.logError(error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private logError = (error: Error, errorInfo: ErrorInfo) => {
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: localStorage.getItem('userId') || 'anonymous'
    };

    try {
      localStorage.setItem(`error_${this.state.errorId}`, JSON.stringify(errorData));
    } catch (e) {
      console.warn('Failed to store error in localStorage:', e);
    }

    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: true,
        custom_map: { error_id: this.state.errorId }
      });
    }
  };

  private handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
      copied: false
    }));

    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    this.retryTimeoutId = setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  private copyErrorDetails = async () => {
    const { error, errorInfo, errorId } = this.state;
    
    const errorDetails = `
Error ID: ${errorId}
Time: ${new Date().toISOString()}
URL: ${window.location.href}

Error Message: ${error?.message || 'Unknown error'}

Stack Trace:
${error?.stack || 'No stack trace available'}

Component Stack:
${errorInfo?.componentStack || 'No component stack available'}

User Agent: ${navigator.userAgent}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorDetails);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  private getErrorSeverity = (): 'low' | 'medium' | 'high' => {
    const { error } = this.state;
    if (!error) return 'low';

    if (error.message.includes('ChunkLoadError') || 
        error.message.includes('Loading chunk')) {
      return 'low';
    }

    if (error.message.includes('Network Error') || 
        error.message.includes('fetch')) {
      return 'medium';
    }

    return 'high';
  };

  private getErrorSuggestion = (): string => {
    const { error } = this.state;
    const severity = this.getErrorSeverity();

    if (!error) return 'Please try refreshing the page.';

    if (error.message.includes('ChunkLoadError') || 
        error.message.includes('Loading chunk')) {
      return 'This appears to be a loading issue. Please refresh the page to download the latest version.';
    }

    if (error.message.includes('Network Error') || 
        error.message.includes('fetch')) {
      return 'This appears to be a network connectivity issue. Please check your internet connection and try again.';
    }

    if (severity === 'high') {
      return 'This appears to be a serious application error. Please refresh the page or contact support if the problem persists.';
    }

    return 'Please try refreshing the page. If the problem persists, contact support.';
  };

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorId, retryCount, copied } = this.state;
      const severity = this.getErrorSeverity();
      const suggestion = this.getErrorSuggestion();

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl w-full"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
                    severity === 'high' ? 'bg-red-100 dark:bg-red-900/20' :
                    severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                    'bg-blue-100 dark:bg-blue-900/20'
                  }`}
                >
                  <AlertTriangle className={`w-8 h-8 ${
                    severity === 'high' ? 'text-red-600 dark:text-red-400' :
                    severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-blue-600 dark:text-blue-400'
                  }`} />
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Oops! Something went wrong
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {suggestion}
                  </p>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    <Bug className="w-4 h-4 mr-2" />
                    Error ID: {errorId}
                  </div>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-4 mb-8"
              >
                <div className="flex flex-col sm:flex-row gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={this.handleRetry}
                    className="flex-1 flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Try Again
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={this.handleGoHome}
                    className="flex-1 flex items-center justify-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                  >
                    <Home className="w-5 h-5 mr-2" />
                    Go Home
                  </motion.button>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={this.handleReload}
                  className="w-full flex items-center justify-center px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Reload Page
                </motion.button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="border-t border-gray-200 dark:border-gray-700 pt-6"
              >
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                    <span>Technical Details</span>
                    <motion.div
                      className="transform transition-transform group-open:rotate-90"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </motion.div>
                  </summary>
                  
                  <div className="mt-4 space-y-3">
                    <div className="text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-300">Error Message:</span>
                      <p className="mt-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-gray-100 font-mono text-xs break-words">
                        {error?.message || 'Unknown error occurred'}
                      </p>
                    </div>

                    {retryCount > 0 && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Retry Attempts:</span>
                        <p className="mt-1 text-gray-600 dark:text-gray-400">{retryCount}</p>
                      </div>
                    )}

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={this.copyErrorDetails}
                      className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                          Copied to Clipboard
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Error Details
                        </>
                      )}
                    </motion.button>
                  </div>
                </details>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6"
              >
                <p>If this problem persists, please contact our support team with the error ID above.</p>
                <p className="mt-1">We apologize for the inconvenience and appreciate your patience.</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};