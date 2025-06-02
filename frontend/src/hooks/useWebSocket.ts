import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { WSEvent, APIKey, LogEntry } from '../types';
import toast from 'react-hot-toast';

export const useWebSocket = (onMessage?: (event: WSEvent) => void) => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const isConnectedRef = useRef(false);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  const { 
    addApiKey, 
    updateApiKey, 
    removeApiKey, 
    addLog 
  } = useStore();

  const handleMessage = useCallback((event: WSEvent) => {
    try {
      // Handle different event types
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
          // Handle system-level updates
          console.log('System update received:', event.data);
          break;

        default:
          console.log('Unknown WebSocket event type:', event.type);
      }

      // Call external message handler if provided
      if (onMessage) {
        onMessage(event);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }, [addApiKey, updateApiKey, removeApiKey, addLog, onMessage]);

  const connect = useCallback(() => {
    try {
      // Don't create multiple connections
      if (ws.current?.readyState === WebSocket.CONNECTING || 
          ws.current?.readyState === WebSocket.OPEN) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;
      
      console.log('Attempting WebSocket connection to:', wsUrl);
      ws.current = new WebSocket(wsUrl);
      
      ws.current.onopen = () => {
        console.log('WebSocket connected successfully');
        isConnectedRef.current = true;
        reconnectAttempts.current = 0;
        
        // Clear any pending reconnection attempts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          handleMessage(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        isConnectedRef.current = false;
        
        // Only attempt reconnection if it wasn't a normal closure and we haven't exceeded max attempts
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(
            baseReconnectDelay * Math.pow(2, reconnectAttempts.current),
            30000 // Max 30 seconds
          );
          
          console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('Max WebSocket reconnection attempts reached');
          toast.error('Connection lost. Please refresh the page.');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnectedRef.current = false;
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      isConnectedRef.current = false;
    }
  }, [handleMessage]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket');
    
    // Clear reconnection timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
    // Close connection
    if (ws.current) {
      ws.current.close(1000, 'Component unmounting');
      ws.current = null;
    }
    
    isConnectedRef.current = false;
    reconnectAttempts.current = 0;
  }, []);

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

  // Initialize connection when authentication is available
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('Initializing WebSocket connection');
      connect();
    }

    return () => {
      console.log('Cleaning up WebSocket connection');
      disconnect();
    };
  }, [connect, disconnect]);

  // Handle page visibility changes to manage connection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, we could optionally close connection to save resources
        console.log('Page hidden');
      } else {
        // Page is visible, ensure connection is active
        console.log('Page visible');
        if (!isConnectedRef.current) {
          const token = localStorage.getItem('token');
          if (token) {
            connect();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network online - attempting WebSocket reconnection');
      if (!isConnectedRef.current) {
        const token = localStorage.getItem('token');
        if (token) {
          connect();
        }
      }
    };

    const handleOffline = () => {
      console.log('Network offline - WebSocket will disconnect');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connect]);

  return { 
    isConnected: isConnectedRef.current,
    sendMessage,
    reconnect: connect,
    disconnect
  };
};