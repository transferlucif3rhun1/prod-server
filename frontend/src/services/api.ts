import axios, { AxiosInstance } from 'axios';
import { APIKey, CreateKeyRequest, UpdateKeyRequest, LogEntry, SystemStats, ApiResponse } from '../types';

class ApiService {
  private api: AxiosInstance;

  constructor() {
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
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  async login(password: string): Promise<{ token: string; expiresAt: number }> {
    const response = await this.api.post('/auth/login', { password });
    return response.data;
  }

  async getHealth(): Promise<{ status: string; stats: SystemStats }> {
    const response = await this.api.get('/health');
    return response.data;
  }

  async createKey(data: CreateKeyRequest): Promise<ApiResponse<APIKey>> {
    const response = await this.api.post('/keys', data);
    return response.data;
  }

  async getKeys(params?: {
    page?: number;
    limit?: number;
    filter?: string;
    search?: string;
  }): Promise<ApiResponse<APIKey[]>> {
    const response = await this.api.get('/keys', { params });
    return response.data;
  }

  async getKey(id: string): Promise<ApiResponse<APIKey>> {
    const response = await this.api.get(`/keys/${id}`);
    return response.data;
  }

  async updateKey(id: string, data: UpdateKeyRequest): Promise<ApiResponse<APIKey>> {
    const response = await this.api.put(`/keys/${id}`, data);
    return response.data;
  }

  async deleteKey(id: string): Promise<{ message: string }> {
    const response = await this.api.delete(`/keys/${id}`);
    return response.data;
  }

  async cleanExpiredKeys(): Promise<{ message: string }> {
    const response = await this.api.post('/keys/clean');
    return response.data;
  }

  async getLogs(params?: {
    page?: number;
    limit?: number;
    level?: string;
    component?: string;
    search?: string;
  }): Promise<ApiResponse<LogEntry[]>> {
    const response = await this.api.get('/logs', { params });
    return response.data;
  }
}

export default new ApiService();