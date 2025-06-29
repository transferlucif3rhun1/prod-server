import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { 
  APIKey, 
  CreateKeyRequest, 
  UpdateKeyRequest, 
  LogEntry, 
  ApiResponse,
  HealthResponse,
  LoginResponse
} from '../types';

interface CacheItem {
  data: unknown;
  timestamp: number;
  ttl: number;
  etag?: string;
}

interface RetryConfig {
  attempts: number;
  delay: number;
  backoffFactor: number;
  maxDelay: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  failureThreshold: number;
  recoveryTimeout: number;
}

interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  metadata?: {
    startTime: number;
  };
}

interface GetKeysParams {
  page?: number;
  limit?: number;
  filter?: string;
  search?: string;
}

interface GetLogsParams {
  page?: number;
  limit?: number;
  level?: string;
  component?: string;
  search?: string;
}

class ApiService {
  private api: AxiosInstance;
  private cache: Map<string, CacheItem>;
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly CACHE_SHORT_TTL = 30 * 1000;
  private retryQueue: Map<string, Promise<unknown>>;
  private circuitBreaker: CircuitBreakerState;
  private healthCheckInterval?: NodeJS.Timeout;
  private networkStatus: 'online' | 'offline' = 'online';

  constructor() {
    this.cache = new Map();
    this.retryQueue = new Map();
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      failureThreshold: 5,
      recoveryTimeout: 30000
    };
    
    this.api = axios.create({
      baseURL: '/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.startHealthMonitoring();
    this.setupNetworkMonitoring();
  }

  private setupInterceptors(): void {
    this.api.interceptors.request.use(
      (config: ExtendedAxiosRequestConfig) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }

        const cacheKey = this.getCacheKey(config.url || '', config.params);
        const cachedItem = this.getCache(cacheKey);
        if (cachedItem?.etag && config.method === 'get') {
          config.headers = config.headers || {};
          config.headers['If-None-Match'] = cachedItem.etag;
        }

        config.metadata = { startTime: new Date().getTime() };
        return config;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );

    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        const config = response.config as ExtendedAxiosRequestConfig;
        const duration = new Date().getTime() - (config.metadata?.startTime || 0);
        
        if (response.status === 304) {
          const cacheKey = this.getCacheKey(response.config.url || '', response.config.params);
          const cachedItem = this.getCache(cacheKey);
          if (cachedItem) {
            return { ...response, data: cachedItem.data };
          }
        }

        if (response.headers.etag && response.config.method === 'get') {
          const cacheKey = this.getCacheKey(response.config.url || '', response.config.params);
          this.setCache(cacheKey, response.data, this.CACHE_TTL, response.headers.etag);
        }

        this.onSuccess();
        
        console.log(`API call completed: ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`);
        return response;
      },
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.handleAuthError();
        } else {
          this.onFailure();
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private setupNetworkMonitoring(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.networkStatus = 'online';
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        console.log('Network connection restored');
      });

      window.addEventListener('offline', () => {
        this.networkStatus = 'offline';
        console.log('Network connection lost');
      });
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.api.get('/health', { timeout: 5000 });
        if (this.circuitBreaker.state === 'half-open') {
          this.circuitBreaker.state = 'closed';
          this.circuitBreaker.failures = 0;
          console.log('Circuit breaker closed - service recovered');
        }
      } catch {
        console.log('Health check failed');
      }
    }, 60000);
  }

  private onSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failures = 0;
    }
  }

  private onFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'open';
      console.log('Circuit breaker opened due to failures');
      
      setTimeout(() => {
        this.circuitBreaker.state = 'half-open';
        console.log('Circuit breaker half-open - testing service');
      }, this.circuitBreaker.recoveryTimeout);
    }
  }

  private isCircuitBreakerOpen(): boolean {
    return this.circuitBreaker.state === 'open';
  }

  private handleAuthError(): void {
    localStorage.removeItem('token');
    this.clearCache();
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }

  private handleError(error: AxiosError | Error): Error {
    if (this.networkStatus === 'offline') {
      return new Error('You are currently offline. Please check your internet connection.');
    }

    if ('code' in error && (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))) {
      return new Error('Request timeout. The server is taking too long to respond.');
    }
    
    if ('response' in error && error.response) {
      const { status, data } = error.response;
      const responseData = data as { error?: string; message?: string };
      const message = responseData?.error || responseData?.message;
      
      const statusErrorMap: Record<number, string> = {
        400: 'Invalid request data. Please check your input.',
        401: 'Session expired. Please login again.',
        403: "Access denied. You don't have permission to perform this action.",
        404: 'Resource not found.',
        409: 'Conflict. The resource already exists.',
        429: 'Too many requests. Please wait a moment and try again.',
        500: 'Server error detected. Our team has been notified and is working on a fix.',
        502: 'Service temporarily unavailable. Please try again in a few moments.',
        503: 'Service temporarily unavailable. Please try again in a few moments.',
        504: 'Service temporarily unavailable. Please try again in a few moments.',
      };

      return new Error(message || statusErrorMap[status] || `Request failed with status ${status}`);
    }
    
    if ('request' in error && error.request) {
      return new Error('Network error. Please check your internet connection and try again.');
    }
    
    return new Error(error.message || 'An unexpected error occurred. Please try again.');
  }

  private getCacheKey(url: string, params?: unknown): string {
    return `${url}:${JSON.stringify(params || {})}`;
  }

  private isValidCache(item: CacheItem): boolean {
    return Date.now() - item.timestamp < item.ttl;
  }

  private setCache(key: string, data: unknown, ttl: number = this.CACHE_TTL, etag?: string): void {
    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)),
      timestamp: Date.now(),
      ttl,
      etag
    });
    
    this.cleanupExpiredCache();
  }

  private getCacheItem(url: string, params?: unknown): CacheItem | null {
    const key = this.getCacheKey(url, params);
    const item = this.cache.get(key);
    if (item && this.isValidCache(item)) {
      return item;
    }
    if (item) {
      this.cache.delete(key);
    }
    return null;
  }

  private getCache(key: string): CacheItem | null {
    const item = this.cache.get(key);
    if (item && this.isValidCache(item)) {
      return item;
    }
    if (item) {
      this.cache.delete(key);
    }
    return null;
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp >= item.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private clearCache(): void {
    this.cache.clear();
  }

  private invalidateCache(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig: RetryConfig = {
      attempts: 3,
      delay: 1000,
      backoffFactor: 2,
      maxDelay: 10000,
      ...config
    };

    if (this.isCircuitBreakerOpen()) {
      throw new Error('Service temporarily unavailable. Please try again later.');
    }

    let lastError: Error;
    
    for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error as Error;
        
        if (attempt === retryConfig.attempts) {
          break;
        }
        
        if ('response' in (error as AxiosError) && (error as AxiosError).response?.status && (error as AxiosError).response!.status < 500) {
          break;
        }
        
        const delay = Math.min(
          retryConfig.delay * Math.pow(retryConfig.backoffFactor, attempt - 1),
          retryConfig.maxDelay
        );
        
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  private async withDeduplication<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.retryQueue.has(key)) {
      return this.retryQueue.get(key) as Promise<T>;
    }

    const promise = operation().finally(() => {
      this.retryQueue.delete(key);
    });

    this.retryQueue.set(key, promise);
    return promise;
  }

  async login(password: string): Promise<LoginResponse> {
    if (!password || password.trim().length === 0) {
      throw new Error('Password is required');
    }

    try {
      const response = await this.withRetry(() => 
        this.api.post<LoginResponse>('/auth/login', { password: password.trim() })
      );
      
      this.clearCache();
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async getHealth(): Promise<HealthResponse> {
    const cacheKey = this.getCacheKey('/health');
    const cached = this.getCache(cacheKey);
    if (cached) return cached.data as HealthResponse;

    try {
      const response = await this.api.get<HealthResponse>('/health');
      const data = response.data;
      
      this.setCache(cacheKey, data, this.CACHE_SHORT_TTL);
      return data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async createKey(data: CreateKeyRequest): Promise<ApiResponse<APIKey>> {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('API key name is required');
    }

    if (!data.expiration) {
      throw new Error('Expiration is required');
    }

    const payload = {
      ...data,
      name: data.name.trim(),
      customKey: data.customKey?.trim() || undefined
    };

    try {
      const response = await this.withRetry(() => 
        this.api.post<ApiResponse<APIKey>>('/keys', payload)
      );
      this.invalidateCache('/keys');
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async getKeys(params?: GetKeysParams, useCache: boolean = true): Promise<ApiResponse<APIKey[]>> {
    const cacheKey = this.getCacheKey('/keys', params);
    
    if (useCache) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached.data as ApiResponse<APIKey[]>;
    }

    try {
      const response = await this.withDeduplication(cacheKey, () =>
        this.withRetry(() => this.api.get<ApiResponse<APIKey[]>>('/keys', { params }))
      );
      const data = response.data;
      
      if (useCache) {
        this.setCache(cacheKey, data);
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async getKey(id: string): Promise<ApiResponse<APIKey>> {
    if (!id || id.trim().length === 0) {
      throw new Error('API key ID is required');
    }

    const cacheKey = this.getCacheKey(`/keys/${id}`);
    const cached = this.getCache(cacheKey);
    if (cached) return cached.data as ApiResponse<APIKey>;

    try {
      const response = await this.withRetry(() => 
        this.api.get<ApiResponse<APIKey>>(`/keys/${id.trim()}`)
      );
      const data = response.data;
      
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async updateKey(id: string, data: UpdateKeyRequest): Promise<ApiResponse<APIKey>> {
    if (!id || id.trim().length === 0) {
      throw new Error('API key ID is required');
    }

    const payload = { ...data };
    if (payload.name !== undefined) {
      if (!payload.name || payload.name.trim().length === 0) {
        throw new Error('API key name cannot be empty');
      }
      payload.name = payload.name.trim();
    }

    try {
      const response = await this.withRetry(() => 
        this.api.put<ApiResponse<APIKey>>(`/keys/${id.trim()}`, payload),
        { attempts: 2 }
      );
      this.invalidateCache('/keys');
      this.invalidateCache(`/keys/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async deleteKey(id: string): Promise<{ message: string; success: boolean; timestamp: string }> {
    if (!id || id.trim().length === 0) {
      throw new Error('API key ID is required');
    }

    try {
      const response = await this.withRetry(() => 
        this.api.delete<{ message: string; success: boolean; timestamp: string }>(`/keys/${id.trim()}`),
        { attempts: 2 }
      );
      this.invalidateCache('/keys');
      this.invalidateCache(`/keys/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async cleanExpiredKeys(): Promise<{ message: string; count?: number; success: boolean; timestamp: string }> {
    try {
      const response = await this.withRetry(() => 
        this.api.post<{ message: string; count?: number; success: boolean; timestamp: string }>('/keys/clean')
      );
      this.invalidateCache('/keys');
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async getLogs(params?: GetLogsParams, useCache: boolean = false): Promise<ApiResponse<LogEntry[]>> {
    const cacheKey = this.getCacheKey('/logs', params);
    
    if (useCache) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached.data as ApiResponse<LogEntry[]>;
    }

    try {
      const response = await this.withRetry(() => 
        this.api.get<ApiResponse<LogEntry[]>>('/logs', { params })
      );
      const data = response.data;
      
      if (useCache) {
        this.setCache(cacheKey, data, 60000);
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  getCacheStats(): { size: number; keys: string[]; hitRate: number } {
    this.cleanupExpiredCache();
    const totalRequests = this.cache.size;
    const cacheHits = Array.from(this.cache.values()).filter(item => 
      this.isValidCache(item)
    ).length;
    
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      hitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0
    };
  }

  getCircuitBreakerStatus(): CircuitBreakerState & { isHealthy: boolean } {
    return {
      ...this.circuitBreaker,
      isHealthy: this.circuitBreaker.state === 'closed'
    };
  }

  getNetworkStatus(): 'online' | 'offline' {
    return this.networkStatus;
  }

  clearAllCache(): void {
    this.clearCache();
  }

  invalidateKeysCache(): void {
    this.invalidateCache('/keys');
  }

  invalidateLogsCache(): void {
    this.invalidateCache('/logs');
  }

  invalidateHealthCache(): void {
    this.invalidateCache('/health');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.api.get('/health', { timeout: 5000 });
      return true;
    } catch {
      console.error('Connection test failed');
      return false;
    }
  }

  getRequestConfig(): {
    baseURL: string;
    timeout: number;
    headers: Record<string, string>;
    circuitBreaker: CircuitBreakerState;
    cacheStats: ReturnType<typeof this.getCacheStats>;
  } {
    return {
      baseURL: this.api.defaults.baseURL || '',
      timeout: this.api.defaults.timeout || 0,
      headers: this.api.defaults.headers as Record<string, string>,
      circuitBreaker: this.circuitBreaker,
      cacheStats: this.getCacheStats()
    };
  }

  setAuthToken(token: string): void {
    if (token) {
      this.api.defaults.headers.Authorization = `Bearer ${token}`;
    } else {
      delete this.api.defaults.headers.Authorization;
    }
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.clearCache();
    this.retryQueue.clear();
  }
}

export default new ApiService();