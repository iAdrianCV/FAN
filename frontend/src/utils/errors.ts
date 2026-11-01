import axios from 'axios';
import { ProblemDetail } from '../types';

/**
 * Normaliza cualquier error de red o de API al formato estándar RFC 7807 (ProblemDetail).
 */
export const extractErrorMessage = (error: unknown): string => {
  if (!error) return 'Ha ocurrido un error inesperado.';

  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ProblemDetail | undefined;

    if (data && typeof data === 'object') {
      if (data.detail && typeof data.detail === 'string') {
        return data.detail;
      }
      if (data.title && typeof data.title === 'string') {
        return data.title;
      }
    }

    if (error.response?.status === 401) {
      return 'Sesión expirada o credenciales inválidas. Por favor vuelva a iniciar sesión.';
    }
    if (error.response?.status === 403) {
      return 'No tiene permisos suficientes para ejecutar esta acción.';
    }
    if (error.response?.status === 404) {
      return 'Recurso no encontrado.';
    }
    if (error.response?.status === 409) {
      return 'Conflicto de integridad en la operación.';
    }
    if (error.response?.status === 422) {
      return 'Datos de entrada incompletos o inválidos.';
    }
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'Tiempo de espera agotado. Verifique su conexión.';
    }
    if (error.message.includes('Network Error') || !error.response) {
      return 'Sin conexión con el servidor API. Verifique que el backend esté en ejecución.';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

