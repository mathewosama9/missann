import { create } from 'zustand';
import type { AuthResponse } from '@miss-ann/shared';

type User = AuthResponse['user'];

// تلميح (ليس سراً): هذا المتصفح سبق له الدخول ← يستحق محاولة تجديد الجلسة عند الفتح.
// الزائر الجديد لا يرسل طلب تجديد محكوم بالفشل (401 في الكونسول + طلب زائد يؤخر الصفحة الأولى)
const HINT = 'ma_session';
const setHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    /* تخزين محجوب (وضع خاص) — لا بأس */
  }
};
export const hadSession = (): boolean => {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return true; // لا نعرف ← نحاول كالسابق
  }
};

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
  setAuth: (r) => {
    setHint(true);
    set({ accessToken: r.accessToken, user: r.user });
  },
  setAccessToken: (t) => {
    setHint(true);
    set({ accessToken: t });
  },
  setUser: (u) => set({ user: u }),
  setReady: () => set({ isReady: true }),
  clear: () => {
    setHint(false);
    set({ accessToken: null, user: null });
  },
}));
