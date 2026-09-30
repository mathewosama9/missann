import { api } from '../../lib/api';
import type {
  RegisterInput,
  LoginInput,
  VerifyOtpInput,
  ResetPasswordInput,
  AuthResponse,
} from '@miss-ann/shared';

export const authApi = {
  register: (data: Omit<RegisterInput, 'confirmPassword'> & { confirmPassword: string }) =>
    api.post<{ message: string; phone: string; requiresVerification: boolean }>('/auth/register', data).then((r) => r.data),

  verifyOtp: (data: VerifyOtpInput) =>
    api.post<{ message: string }>('/auth/verify-otp', data).then((r) => r.data),

  login: (data: LoginInput) => api.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  me: () => api.get<{ user: AuthResponse['user'] }>('/auth/me').then((r) => r.data.user),

  forgot: (phone: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { phone }).then((r) => r.data),

  reset: (data: ResetPasswordInput) =>
    api.post<{ message: string }>('/auth/reset-password', data).then((r) => r.data),
};
