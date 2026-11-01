import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Branch, TokenResponse, User } from '../types';

const STORAGE_KEYS = {
  TOKEN: 'lotepos_token',
  USER: 'lotepos_user',
  BRANCH: 'lotepos_selected_branch',
};

interface AuthState {
  token: string | null;
  user: User | null;
  selectedBranch: Branch | null;
  isAuthenticated: boolean;
  isHydrated: boolean;

  setAuth: (data: TokenResponse) => Promise<void>;
  setSelectedBranch: (branch: Branch | null) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  selectedBranch: null,
  isAuthenticated: false,
  isHydrated: false,

  setAuth: async (data: TokenResponse) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.access_token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
      set({
        token: data.access_token,
        user: data.user,
        isAuthenticated: true,
      });
    } catch (err) {
      console.error('Error al guardar credenciales en AsyncStorage:', err);
    }
  },

  setSelectedBranch: async (branch: Branch | null) => {
    try {
      if (branch) {
        await AsyncStorage.setItem(STORAGE_KEYS.BRANCH, JSON.stringify(branch));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.BRANCH);
      }
      set({ selectedBranch: branch });
    } catch (err) {
      console.error('Error al guardar sucursal seleccionada:', err);
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
      set({
        token: null,
        user: null,
        isAuthenticated: false,
      });
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  },

  hydrate: async () => {
    try {
      const [token, userJson, branchJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.BRANCH),
      ]);

      const user = userJson ? (JSON.parse(userJson) as User) : null;
      const selectedBranch = branchJson ? (JSON.parse(branchJson) as Branch) : null;

      set({
        token,
        user,
        selectedBranch,
        isAuthenticated: !!token && !!user,
        isHydrated: true,
      });
    } catch (err) {
      console.error('Error al hidratar estado de autenticación:', err);
      set({ isHydrated: true });
    }
  },
}));

