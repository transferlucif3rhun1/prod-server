import axios, { AxiosInstance } from 'axios';
import { APIKey, CreateKeyRequest, UpdateKeyRequest, LogEntry, SystemStats, ApiResponse } from '../types';

class ApiService {
  private api: AxiosInstance;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.cache = new Map();
    
    this.api = axios.create({
      baseURL: '/api/v1',
      timeout: 10000,
    });

    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          this.clearCache();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  private getCacheKey(url: string, params?: any): string {
    return `${url}:${JSON.stringify(params || {})}`;
  }

  private isValidCache(item: { timestamp: number; ttl: number }): boolean {
    return Date.now() - item.timestamp < item.ttl;
  }

  private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private getCache(key: string): any | null {
    const item = this.cache.get(key);
    if (item && this.isValidCache(item)) {
      return item.data;
    }
    if (item) {
      this.cache.delete(key);
    }
    return null;
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
    const response = await this.api.post('/auth/login', { password });
    this.clearCache(); // Clear cache on new login
    return response.data;
  }

  async getHealth(): Promise<{ status: string; stats: SystemStats }> {
    const cacheKey = this.getCacheKey('/health');
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const response = await this.api.get('/health');
    this.setCache(cacheKey, response.data, 30000); // Cache for 30 seconds
    return response.data;
  }

  async createKey(data: CreateKeyRequest): Promise<ApiResponse<APIKey>> {
    const response = await this.api.post('/keys', data);
    this.invalidateCache('/keys'); // Invalidate keys cache
    return response.data;
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

    const response = await this.api.get('/keys', { params });
    
    if (useCache) {
      this.setCache(cacheKey, response.data);
    }
    
    return response.data;
  }

  async getKey(id: string): Promise<ApiResponse<APIKey>> {
    const cacheKey = this.getCacheKey(`/keys/${id}`);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const response = await this.api.get(`/keys/${id}`);
    this.setCache(cacheKey, response.data);
    return response.data;
  }

  async updateKey(id: string, data: UpdateKeyRequest): Promise<ApiResponse<APIKey>> {
    const response = await this.api.put(`/keys/${id}`, data);
    this.invalidateCache('/keys');
    this.invalidateCache(`/keys/${id}`);
    return response.data;
  }

  async deleteKey(id: string): Promise<{ message: string }> {
    const response = await this.api.delete(`/keys/${id}`);
    this.invalidateCache('/keys');
    this.invalidateCache(`/keys/${id}`);
    return response.data;
  }

  async cleanExpiredKeys(): Promise<{ message: string }> {
    const response = await this.api.post('/keys/clean');
    this.invalidateCache('/keys');
    return response.data;
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

    const response = await this.api.get('/logs', { params });
    
    if (useCache) {
      this.setCache(cacheKey, response.data, 60000); // Cache logs for 1 minute
    }
    
    return response.data;
  }

  // Cache management methods
  getCacheStats(): { size: number; keys: string[] } {
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
}

export default new ApiService();