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
  id?: string;
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
  type: 'key_created' | 'key_updated' | 'key_deleted' | 'log_entry' | 'system_update' | 'error';
  data?: any;
  changes?: string[];
}

export interface AppError {
  message: string;
  code?: string;
  status?: number;
  timestamp: Date;
}

export interface ToastMessage {
  id?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface FilterOptions {
  search?: string;
  status?: 'all' | 'active' | 'expired' | 'inactive';
  level?: 'all' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  component?: string;
  page?: number;
  limit?: number;
}

export interface KeyStatistics {
  total: number;
  active: number;
  expired: number;
  inactive: number;
  totalUsage: number;
  averageUsage: number;
}

export interface LogStatistics {
  total: number;
  byLevel: Record<string, number>;
  byComponent: Record<string, number>;
  recentCount: number;
}

export interface ExportData {
  keys?: APIKey[];
  logs?: LogEntry[];
  stats?: SystemStats;
  exportedAt: string;
  version: string;
}

export interface UIState {
  sidebarCollapsed: boolean;
  currentPage: string;
  loading: boolean;
  error: string | null;
  selectedItems: Set<string>;
}

export interface FormState {
  createKey: CreateKeyRequest & {
    expirationValue: string;
    expirationUnit: string;
  };
  updateKey: UpdateKeyRequest;
  filters: FilterOptions;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface ConnectionStatus {
  api: boolean;
  websocket: boolean;
  database: boolean;
  lastChecked: Date;
}

export interface NotificationPreferences {
  enableToasts: boolean;
  enableSounds: boolean;
  autoHideSuccess: boolean;
  autoHideError: boolean;
  successDuration: number;
  errorDuration: number;
}

export interface ThemeSettings {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  fontSize: 'small' | 'medium' | 'large';
}

export interface UserPreferences {
  theme: ThemeSettings;
  notifications: NotificationPreferences;
  defaultPageSize: number;
  autoRefresh: boolean;
  autoRefreshInterval: number;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface AsyncOperation<T = any> {
  loading: boolean;
  error: string | null;
  data: T | null;
  lastFetch?: Date;
}

export interface ConfirmationDialog {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ContextMenuOption {
  label: string;
  icon?: React.ComponentType<any>;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}

export interface DataTableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, item: T) => React.ReactNode;
}

export interface SortConfiguration {
  field: string;
  direction: 'asc' | 'desc';
}

export interface TableState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  pagination: PaginationInfo;
  sort: SortConfiguration;
  filters: Record<string, any>;
  selectedItems: Set<string>;
}

export interface MetricValue {
  current: number;
  previous?: number;
  trend?: 'up' | 'down' | 'stable';
  unit?: string;
  format?: 'number' | 'percentage' | 'bytes' | 'duration';
}

export interface DashboardMetrics {
  totalKeys: MetricValue;
  activeKeys: MetricValue;
  expiredKeys: MetricValue;
  totalRequests: MetricValue;
  systemUptime: MetricValue;
  memoryUsage: MetricValue;
  cacheHitRate: MetricValue;
}

export interface ActivityLogEntry {
  id: string;
  type: 'key_created' | 'key_updated' | 'key_deleted' | 'user_login' | 'system_event';
  title: string;
  description: string;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  action: () => void;
  disabled?: boolean;
  badge?: string | number;
}

export interface PresetConfiguration {
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  config: Partial<CreateKeyRequest>;
}

export interface SearchResult<T> {
  item: T;
  matches: string[];
  score: number;
}

export interface BulkOperation {
  type: 'delete' | 'update' | 'export';
  label: string;
  icon: React.ComponentType<any>;
  confirmationRequired: boolean;
  handler: (selectedIds: string[]) => Promise<void>;
}

export type KeyStatus = 'active' | 'expired' | 'inactive';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type SortDirection = 'asc' | 'desc';
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
export type ThemeMode = 'light' | 'dark' | 'system';
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface GenericResponse {
  success: boolean;
  message?: string;
  timestamp: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  stats: SystemStats;
  timestamp: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: number;
  user?: {
    id: string;
    role: string;
  };
}

export interface CreateKeyResponse extends ApiResponse<APIKey> {
  message: string;
}

export interface UpdateKeyResponse extends ApiResponse<APIKey> {
  message: string;
  changes?: string[];
}

export interface DeleteKeyResponse {
  message: string;
  deletedKeyId: string;
}

export interface CleanExpiredResponse {
  message: string;
  count: number;
  deletedKeys: string[];
}

export interface ExportResponse {
  filename: string;
  size: number;
  count: number;
  timestamp: string;
}