import { api } from '../../lib/api';
import type {
  AdminCodeDTO,
  AdminEnrollResultDTO,
  AdminPaymentDTO,
  CodeBatchCreatedDTO,
  CodeBatchDTO,
  CodeStatus,
  Paginated,
  PaymentDTO,
  PaymentInitDTO,
  PaymentPurpose,
  PaymentStatus,
  RedeemResultDTO,
  SubscribeResultDTO,
  WalletDTO,
} from '@miss-ann/shared';

// ── طالب ─────────────────────────────────────────────────────────
export const walletApi = {
  get: () => api.get<WalletDTO>('/wallet').then((r) => r.data),

  redeem: (code: string) => api.post<RedeemResultDTO>('/wallet/redeem', { code }).then((r) => r.data),

  subscribe: (courseId: number) =>
    api.post<SubscribeResultDTO>(`/courses/${courseId}/subscribe`).then((r) => r.data),
};

export const paymentsApi = {
  init: (data: { courseId: number } | { topupAmount: number }) =>
    api.post<PaymentInitDTO>('/payments/paymob/init', data).then((r) => r.data),

  get: (id: number) => api.get<{ payment: PaymentDTO }>(`/payments/${id}`).then((r) => r.data.payment),
};

// ── أدمن ─────────────────────────────────────────────────────────
export const adminCodesApi = {
  createBatch: (data: { label: string; value: number; count: number }) =>
    api.post<CodeBatchCreatedDTO>('/admin/codes/batch', data).then((r) => r.data),

  batches: (page = 1) =>
    api.get<Paginated<CodeBatchDTO>>('/admin/codes/batches', { params: { page, pageSize: 50 } }).then((r) => r.data),

  list: (params: { status?: CodeStatus; batchId?: number; page?: number }) =>
    api.get<Paginated<AdminCodeDTO>>('/admin/codes', { params: { ...params, pageSize: 25 } }).then((r) => r.data),

  disable: (id: number) => api.patch<{ message: string }>(`/admin/codes/${id}/disable`).then((r) => r.data),
};

export interface StudentLookup {
  id: number;
  name: string;
  phone: string;
  balance: number;
}

export const adminFinanceApi = {
  payments: (params: { status?: PaymentStatus; purpose?: PaymentPurpose; page?: number }) =>
    api.get<Paginated<AdminPaymentDTO>>('/admin/payments', { params: { ...params, pageSize: 25 } }).then((r) => r.data),

  lookup: (phone: string) =>
    api.get<{ student: StudentLookup }>('/admin/students/lookup', { params: { phone } }).then((r) => r.data.student),

  topup: (data: { phone: string; amount: number; note: string }) =>
    api.post<{ userId: number; balance: number }>('/admin/wallet/topup', data).then((r) => r.data),

  enroll: (data: { phone: string; courseId: number; note?: string }) =>
    api.post<AdminEnrollResultDTO>('/admin/enrollments', data).then((r) => r.data),
};

// ── الدفع الأونلاين: نحفظ رقم الدفعة ثم ننتقل لصفحة Paymob ─────────
const PENDING_KEY = 'missann:pending-payment';

export async function startOnlinePayment(data: { courseId: number } | { topupAmount: number }): Promise<void> {
  const { paymentId, iframeUrl } = await paymentsApi.init(data);
  try {
    sessionStorage.setItem(PENDING_KEY, String(paymentId));
  } catch {
    /* التخزين غير متاح — صفحة النتيجة تعتمد على رقم الطلب من Paymob */
  }
  window.location.assign(iframeUrl);
}

export function readPendingPaymentId(): number | null {
  try {
    const v = Number(sessionStorage.getItem(PENDING_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* لا شيء */
  }
}
