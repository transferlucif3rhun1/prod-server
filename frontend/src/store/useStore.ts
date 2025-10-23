import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { APIKey, LogEntry, SystemStats, CreateKeyRequest } from '../types';

interface CreateKeyFormData extends CreateKeyRequest {
  expirationValue: string;
  expirationUnit: string;
}

interface NotificationsState {
  show: boolean;
  count: number;
  lastRead: Date;
}

interface ConnectionStatusState {
  api: boolean;
  websocket: boolean;
  lastCheck: Date;
}

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
  
  createKeyForm: CreateKeyFormData;
  notifications: NotificationsState;
  connectionStatus: ConnectionStatusState;
  
  setApiKeys: (keys: APIKey[]) => void;
  addApiKey: (key: APIKey) => void;
  updateApiKey: (key: APIKey) => void;
  removeApiKey: (keyId: string) => void;
  setSelectedKeys: (keys: Set<string>) => void;
  toggleKeySelection: (keyId: string) => void;
  clearSelectedKeys: () => void;
  
  setLogs: (logs: LogEntry[]) => void;
  addLog: (log: LogEntry) => void;
  
  setStats: (stats: SystemStats) => void;
  
  setKeysLoading: (loading: boolean) => void;
  setLogsLoading: (loading: boolean) => void;
  setStatsLoading: (loading: boolean) => void;
  
  setKeysError: (error: string | null) => void;
  setLogsError: (error: string | null) => void;
  setStatsError: (error: string | null) => void;
  
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setCurrentPage: (page: string) => void;
  
  setCreateKeyForm: (form: Partial<CreateKeyFormData>) => void;
  resetCreateKeyForm: () => void;

  updateConnectionStatus: (status: Partial<ConnectionStatusState>) => void;
}

const createDefaultFormData = (): CreateKeyFormData => ({
  name: '',
  rpm: 100,
  threadsLimit: 10,
  totalRequests: 1000,
  customKey: '',
  expiration: '30d',
  expirationValue: '30',
  expirationUnit: 'd'
});

const createDefaultNotifications = (): NotificationsState => ({
  show: false,
  count: 0,
  lastRead: new Date()
});

const createDefaultConnectionStatus = (): ConnectionStatusState => ({
  api: true,
  websocket: false,
  lastCheck: new Date()
});

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      apiKeys: [],
      selectedKeys: new Set<string>(),
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
      createKeyForm: createDefaultFormData(),
      notifications: createDefaultNotifications(),
      connectionStatus: createDefaultConnectionStatus(),
      
      setApiKeys: (keys: APIKey[]) => set({ apiKeys: keys }),
      addApiKey: (key: APIKey) => set((state) => ({ 
        apiKeys: [key, ...state.apiKeys.filter(k => k.id !== key.id)] 
      })),
      updateApiKey: (updatedKey: APIKey) => set((state) => ({
        apiKeys: state.apiKeys.map(key => 
          key.id === updatedKey.id ? { ...key, ...updatedKey } : key
        ),
      })),
      removeApiKey: (keyId: string) => set((state) => {
        const newSelectedKeys = new Set(state.selectedKeys);
        newSelectedKeys.delete(keyId);
        return {
          apiKeys: state.apiKeys.filter(key => key.id !== keyId),
          selectedKeys: newSelectedKeys,
        };
      }),
      setSelectedKeys: (keys: Set<string>) => set({ selectedKeys: new Set(keys) }),
      toggleKeySelection: (keyId: string) => set((state) => {
        const newSelected = new Set(state.selectedKeys);
        if (newSelected.has(keyId)) {
          newSelected.delete(keyId);
        } else {
          newSelected.add(keyId);
        }
        return { selectedKeys: newSelected };
      }),
      clearSelectedKeys: () => set({ selectedKeys: new Set<string>() }),

      setLogs: (logs: LogEntry[]) => set({ logs }),
      addLog: (log: LogEntry) => set((state) => ({ 
        logs: [log, ...state.logs.slice(0, 4999)] 
      })),
      
      setStats: (stats: SystemStats) => set({ stats }),
      
      setKeysLoading: (loading: boolean) => set({ keysLoading: loading }),
      setLogsLoading: (loading: boolean) => set({ logsLoading: loading }),
      setStatsLoading: (loading: boolean) => set({ statsLoading: loading }),

      setKeysError: (error: string | null) => set({ keysError: error }),
      setLogsError: (error: string | null) => set({ logsError: error }),
      setStatsError: (error: string | null) => set({ statsError: error }),

      setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentPage: (page: string) => set({ currentPage: page }),

      setCreateKeyForm: (formUpdates: Partial<CreateKeyFormData>) => set((state) => ({
        createKeyForm: { ...state.createKeyForm, ...formUpdates }
      })),
      resetCreateKeyForm: () => set({ createKeyForm: createDefaultFormData() }),

      updateConnectionStatus: (status: Partial<ConnectionStatusState>) => set((state) => ({
        connectionStatus: { ...state.connectionStatus, ...status, lastCheck: new Date() }
      })),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        createKeyForm: state.createKeyForm,
        notifications: state.notifications
      }),
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = (persistedState || {}) as Record<string, unknown>;
        
        if (version < 2) {
          return {
            ...state,
            createKeyForm: {
              ...createDefaultFormData(),
              ...(typeof state.createKeyForm === 'object' ? state.createKeyForm : {})
            },
            notifications: {
              ...createDefaultNotifications(),
              ...(typeof state.notifications === 'object' ? state.notifications : {})
            }
          };
        }
        return persistedState as AppState;
      }
    }
  )
);