export interface APIKey {
  id: string;
  maskedKey: string;
  name?: string;
  expiration: string;
  rpm: number;
  threadsLimit: number;
  totalRequests: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface CreateKeyRequest {
  customKey?: string;
  name: string;
  rpm: number;
  threadsLimit: number;
  totalRequests: number;
  expiration: string;
}

export interface UpdateKeyRequest {
  name?: string;
  rpm?: number;
  threadsLimit?: number;
  totalRequests?: number;
  expiration?: string;
  isActive?: boolean;
}

export interface LogEntry {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  component: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SystemStats {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  totalRequests: number;
  uptime: number;
  memoryUsage: number;
  goRoutines: number;
  mongoStatus: boolean;
  cacheHitRate: number;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  pagination?: PaginationInfo;
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

export interface WSEvent {
  type: 'key_created' | 'key_updated' | 'key_deleted' | 'system_update';
  data: any;
  changes?: string[];
}