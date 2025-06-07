import axios, { AxiosInstance, AxiosError } from 'axios';
import { APIKey, CreateKeyRequest, UpdateKeyRequest, LogEntry, SystemStats, ApiResponse } from '../types';

class ApiService {
  private api: AxiosInstance;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly CACHE_SHORT_TTL = 30 * 1000;

  constructor() {
    this.cache = new Map();
    
    this.api = axios.create({
      baseURL: '/api/v1',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          this.clearCache();
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: any): Error {
    if (error.code === 'ECONNABORTED') {
      return new Error('Request timeout. Please check your connection and try again.');
    }
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.response.data?.message;
      
      switch (status) {
        case 400:
          return new Error(message || 'Invalid request data. Please check your input.');
        case 401:
          return new Error('Authentication required. Please login again.');
        case 403:
          return new Error('Access denied. You don\'t have permission to perform this action.');
        case 404:
          return new Error(message || 'Resource not found.');
        case 409:
          return new Error(message || 'Conflict. The resource already exists.');
        case 429:
          return new Error('Rate limit exceeded. Please try again later.');
        case 500:
          return new Error('Server error. Please try again later.');
        case 503:
          return new Error('Service temporarily unavailable. Please try again later.');
        default:
          return new Error(message || `Request failed with status ${status}`);
      }
    }
    
    if (error.request) {
      return new Error('Network error. Please check your internet connection.');
    }
    
    return new Error(error.message || 'An unexpected error occurred.');
  }

  private getCacheKey(url: string, params?: any): string {
    return `${url}:${JSON.stringify(params || {})}`;
  }

  private isValidCache(item: { timestamp: number; ttl: number }): boolean {
    return Date.now() - item.timestamp < item.ttl;
  }

  private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)),
      timestamp: Date.now(),
      ttl
    });
    
    this.cleanupExpiredCache();
  }

  private getCache(key: string): any | null {
    const item = this.cache.get(key);
    if (item && this.isValidCache(item)) {
      return JSON.parse(JSON.stringify(item.data));
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

  async login(password: string): Promise<{ token: string; expiresAt: number }> {
    if (!password || password.trim().length === 0) {
      throw new Error('Password is required');
    }

    try {
      const response = await this.api.post('/auth/login', { 
        password: password.trim() 
      });
      
      this.clearCache();
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getHealth(): Promise<{ status: string; stats: SystemStats }> {
    const cacheKey = this.getCacheKey('/health');
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.api.get('/health');
      const data = response.data;
      
      this.setCache(cacheKey, data, this.CACHE_SHORT_TTL);
      return data;
    } catch (error) {
      throw this.handleError(error);
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
      const response = await this.api.post('/keys', payload);
      this.invalidateCache('/keys');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getKeys(params?: {
    page?: number;
    limit?: number;
    filter?: string;
    search?: string;
  }, useCache: boolean = true): Promise<ApiResponse<APIKey[]>> {
    const cacheKey = this.getCacheKey('/keys', params);
    
    if (useCache) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this.api.get('/keys', { params });
      const data = response.data;
      
      if (useCache) {
        this.setCache(cacheKey, data);
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getKey(id: string): Promise<ApiResponse<APIKey>> {
    if (!id || id.trim().length === 0) {
      throw new Error('API key ID is required');
    }

    const cacheKey = this.getCacheKey(`/keys/${id}`);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.api.get(`/keys/${id.trim()}`);
      const data = response.data;
      
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      throw this.handleError(error);
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
      const response = await this.api.put(`/keys/${id.trim()}`, payload);
      this.invalidateCache('/keys');
      this.invalidateCache(`/keys/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteKey(id: string): Promise<{ message: string }> {
    if (!id || id.trim().length === 0) {
      throw new Error('API key ID is required');
    }

    try {
      const response = await this.api.delete(`/keys/${id.trim()}`);
      this.invalidateCache('/keys');
      this.invalidateCache(`/keys/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async cleanExpiredKeys(): Promise<{ message: string; count?: number }> {
    try {
      const response = await this.api.post('/keys/clean');
      this.invalidateCache('/keys');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getLogs(params?: {
    page?: number;
    limit?: number;
    level?: string;
    component?: string;
    search?: string;
  }, useCache: boolean = false): Promise<ApiResponse<LogEntry[]>> {
    const cacheKey = this.getCacheKey('/logs', params);
    
    if (useCache) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this.api.get('/logs', { params });
      const data = response.data;
      
      if (useCache) {
        this.setCache(cacheKey, data, 60000);
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  getCacheStats(): { size: number; keys: string[] } {
    this.cleanupExpiredCache();
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
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
      await this.getHealth();
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  getRequestConfig() {
    return {
      baseURL: this.api.defaults.baseURL,
      timeout: this.api.defaults.timeout,
      headers: this.api.defaults.headers
    };
  }

  setAuthToken(token: string) {
    if (token) {
      this.api.defaults.headers.Authorization = `Bearer ${token}`;
    } else {
      delete this.api.defaults.headers.Authorization;
    }
  }

  async retryRequest<T>(
    requestFn: () => Promise<T>, 
    maxRetries: number = 3, 
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        if (error.response?.status && error.response.status < 500) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    throw lastError!;
  }
}

export default new ApiService();