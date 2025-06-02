import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { WSEvent, APIKey, LogEntry } from '../types';
import toast from 'react-hot-toast';

export const useWebSocket = (onMessage?: (event: WSEvent) => void) => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;
  const mountedRef = useRef(true);

  const { 
    addApiKey, 
    updateApiKey, 
    removeApiKey, 
    addLog 
  } = useStore();

  const handleMessage = useCallback((event: WSEvent) => {
    if (!mountedRef.current) return;

    try {
      switch (event.type) {
        case 'key_created':
          if (event.data) {
            addApiKey(event.data as APIKey);
            toast.success(`New API key created: ${event.data.name || 'Untitled'}`);
          }
          break;

        case 'key_updated':
          if (event.data) {
            updateApiKey(event.data as APIKey);
            toast.success(`API key updated: ${event.data.name || 'Untitled'}`);
          }
          break;

        case 'key_deleted':
          if (event.data?.id) {
            removeApiKey(event.data.id);
            toast.success('API key deleted');
          }
          break;

        case 'log_entry':
          if (event.data) {
            addLog(event.data as LogEntry);
          }
          break;

        case 'system_update':
          if (event.data?.message) {
            toast.info(event.data.message);
          }
          break;

        default:
          console.log('Unknown WebSocket event type:', event.type);
      }

      if (onMessage) {
        onMessage(event);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }, [addApiKey, updateApiKey, removeApiKey, addLog, onMessage]);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      
      if (ws.current.readyState === WebSocket.OPEN || 
          ws.current.readyState === WebSocket.CONNECTING) {
        ws.current.close(1000, 'Component unmounting');
      }
      
      ws.current = null;
    }
    
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    
    if (ws.current?.readyState === WebSocket.CONNECTING || 
        ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No authentication token found, skipping WebSocket connection');
      return;
    }

    try {
      cleanup();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(token)}`;
      
      console.log('Attempting WebSocket connection to:', wsUrl);
      
      ws.current = new WebSocket(wsUrl);
      
      ws.current.onopen = () => {
        if (!mountedRef.current) return;
        
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }

        toast.success('Real-time connection established', { 
          id: 'ws-connection',
          duration: 2000 
        });
      };

      ws.current.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data) as WSEvent;
          handleMessage(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.current.onclose = (event) => {
        if (!mountedRef.current) return;
        
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(
            baseReconnectDelay * Math.pow(2, reconnectAttempts.current),
            30000
          );
          
          console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              reconnectAttempts.current++;
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('Max WebSocket reconnection attempts reached');
          toast.error('Connection lost. Please refresh the page.', {
            id: 'ws-connection-lost',
            duration: 0
          });
        }

        if (event.code !== 1000) {
          toast.error('Real-time connection lost', { 
            id: 'ws-connection',
            duration: 3000 
          });
        }
      };

      ws.current.onerror = (error) => {
        if (!mountedRef.current) return;
        
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

    } catch (error) {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
    }
  }, [handleMessage, cleanup]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket');
    cleanup();
    reconnectAttempts.current = 0;
  }, [cleanup]);

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        return false;
      }
    } else {
      console.warn('WebSocket not connected, cannot send message');
      return false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    const token = localStorage.getItem('token');
    if (token) {
      console.log('Initializing WebSocket connection');
      const timeoutId = setTimeout(connect, 100);
      return () => clearTimeout(timeoutId);
    }

    return () => {
      mountedRef.current = false;
      console.log('Cleaning up WebSocket connection');
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!mountedRef.current) return;
      
      if (document.hidden) {
        console.log('Page hidden - WebSocket will maintain connection');
      } else {
        console.log('Page visible - checking WebSocket connection');
        if (!isConnected) {
          const token = localStorage.getItem('token');
          if (token) {
            setTimeout(connect, 500);
          }
        }
      }
    };

    const handleOnline = () => {
      if (!mountedRef.current) return;
      
      console.log('Network online - attempting WebSocket reconnection');
      if (!isConnected) {
        const token = localStorage.getItem('token');
        if (token) {
          reconnectAttempts.current = 0;
          setTimeout(connect, 1000);
        }
      }
    };

    const handleOffline = () => {
      console.log('Network offline - WebSocket will disconnect');
      setIsConnected(false);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        if (e.newValue) {
          console.log('Auth token added - connecting WebSocket');
          setTimeout(connect, 500);
        } else {
          console.log('Auth token removed - disconnecting WebSocket');
          disconnect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [connect, disconnect, isConnected]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { 
    isConnected,
    sendMessage,
    reconnect: connect,
    disconnect
  };
};