import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { APIKey, LogEntry, SystemStats } from '../types';

interface AppState {
  // API Keys
  apiKeys: APIKey[];
  selectedKeys: Set<string>;
  keysLoading: boolean;
  keysError: string | null;
  
  // Logs
  logs: LogEntry[];
  logsLoading: boolean;
  logsError: string | null;
  
  // System
  stats: SystemStats | null;
  
  // UI State
  sidebarCollapsed: boolean;
  currentPage: string;
  
  // Form State
  createKeyForm: any;
  
  // Actions
  setApiKeys: (keys: APIKey[]) => void;
  addApiKey: (key: APIKey) => void;
  updateApiKey: (key: APIKey) => void;
  removeApiKey: (keyId: string) => void;
  setSelectedKeys: (keys: Set<string>) => void;
  
  setLogs: (logs: LogEntry[]) => void;
  addLog: (log: LogEntry) => void;
  
  setStats: (stats: SystemStats) => void;
  
  setKeysLoading: (loading: boolean) => void;
  setKeysError: (error: string | null) => void;
  setLogsLoading: (loading: boolean) => void;
  setLogsError: (error: string | null) => void;
  
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCurrentPage: (page: string) => void;
  
  setCreateKeyForm: (form: any) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      apiKeys: [],
      selectedKeys: new Set(),
      keysLoading: false,
      keysError: null,
      
      logs: [],
      logsLoading: false,
      logsError: null,
      
      stats: null,
      
      sidebarCollapsed: false,
      currentPage: 'create',
      
      createKeyForm: {
        name: '',
        rpm: 100,
        threadsLimit: 10,
        totalRequests: 1000,
        customKey: '',
        expiration: '30d',
        expirationValue: '30',
        expirationUnit: 'd'
      },

      // API Keys actions
      setApiKeys: (keys) => set({ apiKeys: keys }),
      
      addApiKey: (key) => set((state) => ({
        apiKeys: [key, ...state.apiKeys]
      })),
      
      updateApiKey: (updatedKey) => set((state) => ({
        apiKeys: state.apiKeys.map(key => 
          key.id === updatedKey.id ? updatedKey : key
        )
      })),
      
      removeApiKey: (keyId) => set((state) => ({
        apiKeys: state.apiKeys.filter(key => key.id !== keyId),
        selectedKeys: new Set([...state.selectedKeys].filter(id => id !== keyId))
      })),
      
      setSelectedKeys: (keys) => set({ selectedKeys: keys }),

      // Logs actions
      setLogs: (logs) => set({ logs }),
      
      addLog: (log) => set((state) => ({
        logs: [log, ...state.logs.slice(0, 999)] // Keep last 1000 logs
      })),

      // System actions
      setStats: (stats) => set({ stats }),

      // Loading and error actions
      setKeysLoading: (loading) => set({ keysLoading: loading }),
      setKeysError: (error) => set({ keysError: error }),
      setLogsLoading: (loading) => set({ logsLoading: loading }),
      setLogsError: (error) => set({ logsError: error }),

      // UI actions
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCurrentPage: (page) => set({ currentPage: page }),
      
      // Form actions
      setCreateKeyForm: (form) => set({ createKeyForm: form }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        createKeyForm: state.createKeyForm,
      }),
    }
  )
);