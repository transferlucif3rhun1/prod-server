import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { WSEvent, APIKey, LogEntry } from '../types';

interface WebSocketMetrics {
  totalConnections: number;
  totalReconnections: number;
  totalMessages: number;
  totalErrors: number;
  lastError: string | null;
  connectionUptime: number;
}

interface MessagePayload {
  type: string;
  timestamp: string;
}

interface UseWebSocketOptions {
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  maxQueueSize?: number;
  onMessage?: (event: WSEvent) => void;
}

const DEFAULT_OPTIONS: Required<UseWebSocketOptions> = {
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  heartbeatInterval: 30000,
  maxQueueSize: 100,
  onMessage: () => {}
};

const useToastManager = () => {
  const lastToastTimes = useRef<Record<string, number>>({});
  const MIN_TOAST_INTERVAL = 5000;

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info', id?: string) => {
    const toastId = id || `${type}-${message}`;
    const now = Date.now();
    const lastTime = lastToastTimes.current[toastId] || 0;

    if (now - lastTime >= MIN_TOAST_INTERVAL) {
      import('react-hot-toast').then(({ default: toast }) => {
        switch (type) {
          case 'success':
            toast.success(message, { id: toastId, duration: 3000 });
            break;
          case 'error':
            toast.error(message, { id: toastId, duration: 5000 });
            break;
          case 'info':
            toast(message, { id: toastId, duration: 4000 });
            break;
        }
      });
      lastToastTimes.current[toastId] = now;
    }
  }, []);

  return { showToast };
};

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const config = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatInterval = useRef<NodeJS.Timeout>();
  const connectionStartTime = useRef<number>(0);
  const messageQueue = useRef<WSEvent[]>([]);
  const mountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const reconnectAttempts = useRef(0);
  
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [metrics, setMetrics] = useState<WebSocketMetrics>({
    totalConnections: 0,
    totalReconnections: 0,
    totalMessages: 0,
    totalErrors: 0,
    lastError: null,
    connectionUptime: 0
  });

  const { 
    addApiKey, 
    updateApiKey, 
    removeApiKey, 
    addLog,
    updateConnectionStatus 
  } = useStore();

  const { showToast } = useToastManager();

  const updateMetrics = useCallback((updates: Partial<WebSocketMetrics>) => {
    if (!mountedRef.current) return;
    setMetrics(prev => ({
      ...prev,
      ...updates,
      connectionUptime: connectionStartTime.current ? Date.now() - connectionStartTime.current : 0
    }));
  }, []);

  const handleMessage = useCallback((event: WSEvent) => {
    if (!mountedRef.current) return;

    updateMetrics({ totalMessages: metrics.totalMessages + 1 });

    try {
      switch (event.type) {
        case 'key_created':
          if (event.data) {
            addApiKey(event.data as APIKey);
            showToast(`New API key created: ${(event.data as APIKey).name || 'Untitled'}`, 'success');
          }
          break;

        case 'key_updated':
          if (event.data) {
            updateApiKey(event.data as APIKey);
            showToast(`API key updated: ${(event.data as APIKey).name || 'Untitled'}`, 'success');
          }
          break;

        case 'key_deleted':
          if (event.data && typeof event.data === 'object' && 'id' in event.data) {
            removeApiKey((event.data as { id: string }).id);
            showToast('API key deleted', 'info');
          }
          break;

        case 'log_entry':
          if (event.data) {
            addLog(event.data as LogEntry);
          }
          break;

        case 'system_update':
          if (event.data && typeof event.data === 'object' && 'message' in event.data) {
            showToast((event.data as { message: string }).message, 'success', 'system-update');
          }
          break;

        case 'pong':
          break;

        case 'error':
          if (event.data && typeof event.data === 'object' && 'message' in event.data) {
            const errorMessage = (event.data as { message: string }).message;
            showToast(errorMessage, 'error', 'system-error');
            updateMetrics({ 
              totalErrors: metrics.totalErrors + 1,
              lastError: errorMessage 
            });
          }
          break;

        default:
          console.log('Unknown WebSocket event type:', event.type);
      }

      config.onMessage?.(event);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      updateMetrics({ 
        totalErrors: metrics.totalErrors + 1,
        lastError: `Message handling error: ${error}` 
      });
    }
  }, [addApiKey, updateApiKey, removeApiKey, addLog, config.onMessage, metrics.totalMessages, metrics.totalErrors, updateMetrics, showToast]);

  const processMessageQueue = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN && messageQueue.current.length > 0) {
      const messages = messageQueue.current.splice(0);
      messages.forEach(message => {
        try {
          ws.current?.send(JSON.stringify(message));
        } catch (error) {
          console.error('Failed to send queued message:', error);
        }
      });
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
    }

    heartbeatInterval.current = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        try {
          const heartbeatMessage: MessagePayload = {
            type: 'ping',
            timestamp: new Date().toISOString()
          };
          ws.current.send(JSON.stringify(heartbeatMessage));
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
        }
      }
    }, config.heartbeatInterval);
  }, [config.heartbeatInterval]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = undefined;
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log('Cleaning up WebSocket connection');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    stopHeartbeat();
    
    if (ws.current) {
      const currentWs = ws.current;
      ws.current = null;
      
      currentWs.onopen = null;
      currentWs.onmessage = null;
      currentWs.onclose = null;
      currentWs.onerror = null;
      
      if (currentWs.readyState === WebSocket.OPEN || 
          currentWs.readyState === WebSocket.CONNECTING) {
        try {
          currentWs.close(1000, 'Component unmounting');
        } catch (error) {
          console.error('Error closing WebSocket:', error);
        }
      }
    }
    
    if (mountedRef.current) {
      setIsConnected(false);
      setConnectionState('disconnected');
      updateConnectionStatus({ websocket: false });
    }
    
    connectionStartTime.current = 0;
    isConnectingRef.current = false;
  }, [stopHeartbeat, updateConnectionStatus]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    
    if (isConnectingRef.current || 
        ws.current?.readyState === WebSocket.CONNECTING || 
        ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No authentication token found, skipping WebSocket connection');
      return;
    }

    try {
      isConnectingRef.current = true;
      cleanup();
      setConnectionState('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/server/api/v1/ws?token=${encodeURIComponent(token)}`;
      
      console.log('Attempting WebSocket connection');
      
      ws.current = new WebSocket(wsUrl);
      connectionStartTime.current = Date.now();
      
      ws.current.onopen = () => {
        if (!mountedRef.current) return;
        
        console.log('WebSocket connected successfully');
        isConnectingRef.current = false;
        setIsConnected(true);
        setConnectionState('connected');
        reconnectAttempts.current = 0;
        
        updateMetrics({ 
          totalConnections: metrics.totalConnections + 1,
          lastError: null 
        });
        
        updateConnectionStatus({ websocket: true });
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }

        startHeartbeat();
        processMessageQueue();

        showToast('Real-time connection established', 'success', 'ws-connection');
      };

      ws.current.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data) as WSEvent;
          handleMessage(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
          updateMetrics({ 
            totalErrors: metrics.totalErrors + 1,
            lastError: `Parse error: ${error}` 
          });
        }
      };

      ws.current.onclose = (event) => {
        if (!mountedRef.current) return;
        
        console.log('WebSocket disconnected:', event.code, event.reason);
        isConnectingRef.current = false;
        setIsConnected(false);
        setConnectionState('disconnected');
        stopHeartbeat();
        updateConnectionStatus({ websocket: false });
        
        if (event.code !== 1000 && reconnectAttempts.current < config.maxReconnectAttempts) {
          setConnectionState('reconnecting');
          const delay = Math.min(
            config.reconnectDelay * Math.pow(2, reconnectAttempts.current),
            30000
          );
          
          console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${config.maxReconnectAttempts})`);
          
          updateMetrics({ totalReconnections: metrics.totalReconnections + 1 });
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              reconnectAttempts.current++;
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= config.maxReconnectAttempts) {
          console.error('Max WebSocket reconnection attempts reached');
          updateMetrics({ 
            lastError: 'Max reconnection attempts reached' 
          });
          showToast('Connection lost. Please refresh the page.', 'error', 'ws-connection-lost');
        }

        if (event.code !== 1000) {
          showToast('Real-time connection lost', 'error', 'ws-connection');
        }
      };

      ws.current.onerror = (error) => {
        if (!mountedRef.current) return;
        
        console.error('WebSocket error:', error);
        isConnectingRef.current = false;
        setIsConnected(false);
        updateMetrics({ 
          totalErrors: metrics.totalErrors + 1,
          lastError: 'Connection error occurred' 
        });
        updateConnectionStatus({ websocket: false });
      };

    } catch (error) {
      console.error('WebSocket connection error:', error);
      isConnectingRef.current = false;
      setIsConnected(false);
      setConnectionState('disconnected');
      updateMetrics({ 
        totalErrors: metrics.totalErrors + 1,
        lastError: `Connection setup error: ${error}` 
      });
    }
  }, [handleMessage, cleanup, startHeartbeat, processMessageQueue, stopHeartbeat, updateConnectionStatus, metrics.totalConnections, metrics.totalErrors, metrics.totalReconnections, updateMetrics, showToast, config.maxReconnectAttempts, config.reconnectDelay]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket');
    cleanup();
    reconnectAttempts.current = 0;
    messageQueue.current = [];
    updateConnectionStatus({ websocket: false });
  }, [cleanup, updateConnectionStatus]);

  const sendMessage = useCallback((message: MessagePayload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        updateMetrics({ 
          totalErrors: metrics.totalErrors + 1,
          lastError: `Send error: ${error}` 
        });
        return false;
      }
    } else {
      if (messageQueue.current.length < config.maxQueueSize) {
        messageQueue.current.push(message as WSEvent);
        console.log('Message queued for sending when connection is available');
      } else {
        console.warn('Message queue full, dropping message');
      }
      return false;
    }
  }, [metrics.totalErrors, updateMetrics, config.maxQueueSize]);

  const forceReconnect = useCallback(() => {
    console.log('Force reconnecting WebSocket');
    reconnectAttempts.current = 0;
    cleanup();
    setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, 1000);
  }, [cleanup, connect]);

  const getConnectionStatus = useCallback(() => {
    return {
      isConnected,
      state: connectionState,
      reconnectAttempts: reconnectAttempts.current,
      maxReconnectAttempts: config.maxReconnectAttempts,
      queuedMessages: messageQueue.current.length,
      metrics: {
        ...metrics,
        connectionUptime: connectionStartTime.current ? Date.now() - connectionStartTime.current : 0
      }
    };
  }, [isConnected, connectionState, metrics, config.maxReconnectAttempts]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isConnectingRef.current) {
      console.log('Initializing WebSocket connection');
      const timeoutId = setTimeout(connect, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [connect]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!mountedRef.current) return;
      
      if (document.hidden) {
        console.log('Page hidden - maintaining connection but reducing activity');
        stopHeartbeat();
      } else {
        console.log('Page visible - resuming full activity');
        if (isConnected && ws.current?.readyState === WebSocket.OPEN) {
          startHeartbeat();
        } else if (!isConnected && !isConnectingRef.current) {
          const token = localStorage.getItem('token');
          if (token) {
            setTimeout(connect, 500);
          }
        }
      }
    };

    const handleOnline = () => {
      if (!mountedRef.current) return;
      
      console.log('Network online - attempting reconnection');
      if (!isConnected && !isConnectingRef.current) {
        const token = localStorage.getItem('token');
        if (token) {
          reconnectAttempts.current = 0;
          setTimeout(connect, 1000);
        }
      }
    };

    const handleOffline = () => {
      console.log('Network offline');
      setIsConnected(false);
      updateConnectionStatus({ websocket: false });
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        if (e.newValue && !isConnectingRef.current) {
          console.log('Auth token added - connecting WebSocket');
          setTimeout(connect, 500);
        } else {
          console.log('Auth token removed - disconnecting WebSocket');
          disconnect();
        }
      }
    };

    const handleBeforeUnload = () => {
      mountedRef.current = false;
      if (ws.current?.readyState === WebSocket.OPEN) {
        try {
          ws.current.close(1000, 'Page unloading');
        } catch (error) {
          console.error('Error closing WebSocket on unload:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [connect, disconnect, isConnected, startHeartbeat, stopHeartbeat, updateConnectionStatus]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return useMemo(() => ({ 
    isConnected,
    connectionState,
    sendMessage,
    reconnect: forceReconnect,
    disconnect,
    getConnectionStatus,
    metrics
  }), [isConnected, connectionState, sendMessage, forceReconnect, disconnect, getConnectionStatus, metrics]);
};