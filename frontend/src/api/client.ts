import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';
import { ProblemDetail } from '../types';

// En Expo o emulador Android, localhost puede ser 10.0.2.2 o la IP local de la máquina de desarrollo
export const API_BASE_URL = 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Interceptor de Request: inyecta Bearer token de Zustand
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor de Response: captura errores RFC 7807 y maneja 401
apiClient.interceptors.response.use(
  (response) => {
    useUIStore.getState().setOnlineStatus(true);
    return response;
  },
  async (error: AxiosError<ProblemDetail>) => {
    if (!error.response) {
      useUIStore.getState().setOnlineStatus(false);
      useUIStore.getState().showToast(
        'Sin conexión con el servidor. Verifique su red.',
        'error',
        'Error de Red'
      );
      return Promise.reject(error);
    }

    useUIStore.getState().setOnlineStatus(true);

    if (error.response.status === 401) {
      // Token expirado o no autorizado
      await useAuthStore.getState().logout();
      useUIStore.getState().showToast(
        'Su sesión ha expirado. Inicie sesión nuevamente.',
        'warning',
        'Sesión Caducada'
      );
    }

    return Promise.reject(error);
  }
);

