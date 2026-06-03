import axios from 'axios';

console.log('[api] baseURL:', import.meta.env.VITE_API_URL || 'http://localhost:3001');

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sokopay_token') || localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sokopay_token');
      localStorage.removeItem('token');
      window.location.href = '/onboarding';
    }
    return Promise.reject(error);
  }
);
