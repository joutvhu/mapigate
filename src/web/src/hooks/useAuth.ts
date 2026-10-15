import { create } from "zustand";
import { AuthService, onAuthLock } from "../services/authService";

interface AuthState {
  isChecking: boolean;
  isPasswordSet: boolean;
  isAuthenticated: boolean;
  isLocked: boolean;
  checkAuth: () => Promise<void>;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  lock: () => void;
  unlock: (token: string) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  isChecking: true,
  isPasswordSet: false,
  isAuthenticated: true,
  isLocked: false,

  checkAuth: async () => {
    set({ isChecking: true });
    try {
      const status = await AuthService.checkStatus();
      if (!status.enabled) {
        set({
          isChecking: false,
          isPasswordSet: false,
          isAuthenticated: true,
          isLocked: false,
        });
        return;
      }

      set({
        isChecking: false,
        isPasswordSet: true,
        isAuthenticated: status.authenticated,
        isLocked: !status.authenticated,
      });
    } catch {
      set({
        isChecking: false,
        isPasswordSet: false,
        isAuthenticated: true,
        isLocked: false,
      });
    }
  },

  login: async (password: string) => {
    const res = await AuthService.login(password);
    if (res.success) {
      set({
        isAuthenticated: true,
        isLocked: false,
      });
      return { success: true };
    }
    return { success: false, error: res.error };
  },

  logout: async () => {
    await AuthService.logout();
    const isSet = get().isPasswordSet;
    set({
      isAuthenticated: !isSet,
      isLocked: isSet,
    });
  },

  lock: () => {
    if (get().isPasswordSet) {
      AuthService.removeToken();
      set({
        isAuthenticated: false,
        isLocked: true,
      });
    }
  },

  unlock: (token: string) => {
    AuthService.setToken(token);
    set({
      isAuthenticated: true,
      isLocked: false,
    });
  },
}));

// Subscribe to auth lock events (e.g. from 401 API responses)
if (typeof window !== "undefined") {
  onAuthLock(() => {
    useAuth.getState().lock();
  });
}
