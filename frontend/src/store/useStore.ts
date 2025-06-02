import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { APIKey, LogEntry, SystemStats, CreateKeyRequest } from '../types';

interface AppState {
  apiKeys: APIKey[];
  selectedKeys: Set<string>;
  keysLoading: boolean;
  keysError: string | null;
  
  logs: LogEntry[];
  logsLoading: boolean;
  logsError: string | null;
  
  stats: SystemStats | null;
  statsLoading: boolean;
  statsError: string | null;
  
  sidebarCollapsed: boolean;
  currentPage: string;
  
  createKeyForm: CreateKeyRequest & {
    expirationValue: string;
    expirationUnit: string;
  };
  
  notifications: {
    show: boolean;
    count: number;
    lastRead: Date;
  };
  
  connectionStatus: {
    api: boolean;
    websocket: boolean;
    lastCheck: Date;
  };
  
  setApiKeys: (keys: APIKey[]) => void;
  addApiKey: (key: APIKey) => void;
  updateApiKey: (key: APIKey) => void;
  removeApiKey: (keyId: string) => void;
  setSelectedKeys: (keys: Set<string>) => void;
  toggleKeySelection: (keyId: string) => void;
  clearSelectedKeys: () => void;
  
  setLogs: (logs: LogEntry[]) => void;
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  removeLogs: (logIds: string[]) => void;
  
  setStats: (stats: SystemStats) => void;
  updateStats: (partialStats: Partial<SystemStats>) => void;
  
  setKeysLoading: (loading: boolean) => void;
  setKeysError: (error: string | null) => void;
  setLogsLoading: (loading: boolean) => void;
  setLogsError: (error: string | null) => void;
  setStatsLoading: (loading: boolean) => void;
  setStatsError: (error: string | null) => void;
  
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setCurrentPage: (page: string) => void;
  
  setCreateKeyForm: (form: Partial<AppState['createKeyForm']>) => void;
  resetCreateKeyForm: () => void;
  
  updateNotifications: (updates: Partial<AppState['notifications']>) => void;
  markNotificationsAsRead: () => void;
  
  updateConnectionStatus: (status: Partial<AppState['connectionStatus']>) => void;
  
  getActiveKeys: () => APIKey[];
  getExpiredKeys: () => APIKey[];
  getInactiveKeys: () => APIKey[];
  getKeyById: (id: string) => APIKey | undefined;
  getKeysByStatus: (status: 'active' | 'expired' | 'inactive') => APIKey[];
  getRecentLogs: (count?: number) => LogEntry[];
  getLogsByLevel: (level: string) => LogEntry[];
  getLogsByComponent: (component: string) => LogEntry[];
  
  clearAllData: () => void;
  resetErrorStates: () => void;
}

const defaultCreateKeyForm = {
  name: '',
  rpm: 100,
  threadsLimit: 10,
  totalRequests: 1000,
  customKey: '',
  expiration: '30d',
  expirationValue: '30',
  expirationUnit: 'd'
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      apiKeys: [],
      selectedKeys: new Set(),
      keysLoading: false,
      keysError: null,
      
      logs: [],
      logsLoading: false,
      logsError: null,
      
      stats: null,
      statsLoading: false,
      statsError: null,
      
      sidebarCollapsed: false,
      currentPage: '/create',
      
      createKeyForm: defaultCreateKeyForm,
      
      notifications: {
        show: false,
        count: 0,
        lastRead: new Date()
      },
      
      connectionStatus: {
        api: false,
        websocket: false,
        lastCheck: new Date()
      },

      setApiKeys: (keys) => {
        set({ 
          apiKeys: [...keys],
          keysError: null 
        });
      },
      
      addApiKey: (key) => {
        set((state) => {
          const existingIndex = state.apiKeys.findIndex(k => k.id === key.id);
          if (existingIndex !== -1) {
            const updatedKeys = [...state.apiKeys];
            updatedKeys[existingIndex] = key;
            return { apiKeys: updatedKeys };
          }
          return { 
            apiKeys: [key, ...state.apiKeys],
            keysError: null 
          };
        });
      },
      
      updateApiKey: (updatedKey) => {
        set((state) => ({
          apiKeys: state.apiKeys.map(key => 
            key.id === updatedKey.id ? { ...key, ...updatedKey } : key
          ),
          keysError: null
        }));
      },
      
      removeApiKey: (keyId) => {
        set((state) => {
          const newSelectedKeys = new Set(state.selectedKeys);
          newSelectedKeys.delete(keyId);
          
          return {
            apiKeys: state.apiKeys.filter(key => key.id !== keyId),
            selectedKeys: newSelectedKeys,
            keysError: null
          };
        });
      },
      
      setSelectedKeys: (keys) => {
        set({ selectedKeys: new Set(keys) });
      },
      
      toggleKeySelection: (keyId) => {
        set((state) => {
          const newSelected = new Set(state.selectedKeys);
          if (newSelected.has(keyId)) {
            newSelected.delete(keyId);
          } else {
            newSelected.add(keyId);
          }
          return { selectedKeys: newSelected };
        });
      },
      
      clearSelectedKeys: () => {
        set({ selectedKeys: new Set() });
      },

      setLogs: (logs) => {
        set({ 
          logs: [...logs],
          logsError: null 
        });
      },
      
      addLog: (log) => {
        set((state) => ({
          logs: [log, ...state.logs.slice(0, 4999)],
          logsError: null
        }));
      },
      
      clearLogs: () => {
        set({ 
          logs: [],
          logsError: null 
        });
      },
      
      removeLogs: (logIds) => {
        set((state) => ({
          logs: state.logs.filter(log => 
            !logIds.includes(log.id || '')
          )
        }));
      },

      setStats: (stats) => {
        set({ 
          stats: { ...stats },
          statsError: null 
        });
      },
      
      updateStats: (partialStats) => {
        set((state) => ({
          stats: state.stats ? { ...state.stats, ...partialStats } : null,
          statsError: null
        }));
      },

      setKeysLoading: (loading) => set({ keysLoading: loading }),
      setKeysError: (error) => set({ keysError: error }),
      setLogsLoading: (loading) => set({ logsLoading: loading }),
      setLogsError: (error) => set({ logsError: error }),
      setStatsLoading: (loading) => set({ statsLoading: loading }),
      setStatsError: (error) => set({ statsError: error }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      
      setCurrentPage: (page) => set({ currentPage: page }),

      setCreateKeyForm: (formUpdates) => {
        set((state) => ({
          createKeyForm: { ...state.createKeyForm, ...formUpdates }
        }));
      },
      
      resetCreateKeyForm: () => {
        set({ createKeyForm: { ...defaultCreateKeyForm } });
      },
      
      updateNotifications: (updates) => {
        set((state) => ({
          notifications: { ...state.notifications, ...updates }
        }));
      },
      
      markNotificationsAsRead: () => {
        set((state) => ({
          notifications: {
            ...state.notifications,
            count: 0,
            lastRead: new Date()
          }
        }));
      },
      
      updateConnectionStatus: (status) => {
        set((state) => ({
          connectionStatus: {
            ...state.connectionStatus,
            ...status,
            lastCheck: new Date()
          }
        }));
      },

      getActiveKeys: () => {
        const { apiKeys } = get();
        const now = new Date();
        return apiKeys.filter(key => 
          key.isActive && new Date(key.expiration) > now
        );
      },
      
      getExpiredKeys: () => {
        const { apiKeys } = get();
        const now = new Date();
        return apiKeys.filter(key => 
          new Date(key.expiration) <= now
        );
      },
      
      getInactiveKeys: () => {
        const { apiKeys } = get();
        return apiKeys.filter(key => !key.isActive);
      },
      
      getKeyById: (id) => {
        const { apiKeys } = get();
        return apiKeys.find(key => key.id === id);
      },
      
      getKeysByStatus: (status) => {
        const state = get();
        switch (status) {
          case 'active':
            return state.getActiveKeys();
          case 'expired':
            return state.getExpiredKeys();
          case 'inactive':
            return state.getInactiveKeys();
          default:
            return [];
        }
      },
      
      getRecentLogs: (count = 100) => {
        const { logs } = get();
        return logs
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, count);
      },
      
      getLogsByLevel: (level) => {
        const { logs } = get();
        return logs.filter(log => log.level === level);
      },
      
      getLogsByComponent: (component) => {
        const { logs } = get();
        return logs.filter(log => log.component === component);
      },
      
      clearAllData: () => {
        set({
          apiKeys: [],
          selectedKeys: new Set(),
          logs: [],
          stats: null,
          keysError: null,
          logsError: null,
          statsError: null,
          notifications: {
            show: false,
            count: 0,
            lastRead: new Date()
          }
        });
      },
      
      resetErrorStates: () => {
        set({
          keysError: null,
          logsError: null,
          statsError: null
        });
      }
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        createKeyForm: state.createKeyForm,
        notifications: state.notifications
      }),
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          return {
            ...persistedState,
            createKeyForm: {
              ...defaultCreateKeyForm,
              ...persistedState.createKeyForm
            },
            notifications: {
              show: false,
              count: 0,
              lastRead: new Date(),
              ...persistedState.notifications
            }
          };
        }
        return persistedState;
      }
    }
  )
);