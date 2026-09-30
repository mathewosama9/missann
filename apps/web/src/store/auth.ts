import { create } from 'zustand';
import type { AuthResponse } from '@miss-ann/shared';

type User = AuthResponse['user'];

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isReady: boolean; // انتهت محاولة الاستعادة الأولى
  setAuth: (r: AuthResponse) => void;
  setAccessToken: (t: string) => void;
  setUser: (u: User) => void;
  setReady: () => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isReady: false,
  setAuth: (r) => set({ accessToken: r.accessToken, user: r.user }),
  setAccessToken: (t) => set({ accessToken: t }),
  setUser: (u) => set({ user: u }),
  setReady: () => set({ isReady: true }),
  clear: () => set({ accessToken: null, user: null }),
}));
