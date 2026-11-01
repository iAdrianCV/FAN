import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface UIState {
  toast: ToastMessage | null;
  isOnline: boolean;

  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  hideToast: () => void;
  setOnlineStatus: (isOnline: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  toast: null,
  isOnline: true,

  showToast: (message: string, type: ToastType = 'info', title?: string, duration = 4000) => {
    const id = Date.now().toString();
    set({
      toast: {
        id,
        message,
        type,
        title,
        duration,
      },
    });

    if (duration > 0) {
      setTimeout(() => {
        set((state) => {
          if (state.toast?.id === id) {
            return { toast: null };
          }
          return state;
        });
      }, duration);
    }
  },

  hideToast: () => {
    set({ toast: null });
  },

  setOnlineStatus: (isOnline: boolean) => {
    set({ isOnline });
  },
}));

