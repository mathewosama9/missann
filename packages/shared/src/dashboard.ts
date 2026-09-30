import type { Role } from './enums.js';

// ── لوحات التحكم (Phase 8) ──────────────────────────────────────

// الرسوم البيانية في لوحة الأدمن: آخر 30 يوماً (بتوقيت القاهرة)
export const STATS_DAYS = 30;
// عدد أحدث الاشتراكات/المدفوعات في لوحة الأدمن
export const STATS_LATEST = 8;
// كلمة المرور المؤقتة (إعادة تعيين من الأدمن / حساب مساعد جديد) — تُعرض مرة واحدة فقط
export const TEMP_PASSWORD_LENGTH = 10;

// شارات التحفيز حسب النجوم (نجمة لكل حصة مكتملة) — تصاعدياً
export const STAR_BADGES = [
  { min: 0, label: 'بداية الرحلة' },
  { min: 1, label: 'مستكشف صغير' },
  { min: 5, label: 'عالِم ناشئ' },
  { min: 15, label: 'باحث علوم' },
  { min: 30, label: 'عالِم كبير' },
] as const;

// الشارة الحالية والتالية (null = أعلى شارة)
export function starBadge(stars: number): { label: string; next: { label: string; remaining: number } | null } {
  let i = 0;
  while (i + 1 < STAR_BADGES.length && stars >= STAR_BADGES[i + 1]!.min) i++;
  const next = STAR_BADGES[i + 1];
  return { label: STAR_BADGES[i]!.label, next: next ? { label: next.label, remaining: next.min - stars } : null };
}

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'طالب',
  ASSISTANT: 'مساعد',
  ADMIN: 'أدمن',
};

// أسماء العمليات في سجل التدقيق (العملية غير المعروفة تُعرض باسمها كما هو)
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'تسجيل دخول',
  ADMIN_ENROLL: 'اشتراك يدوي',
  ADMIN_WALLET_TOPUP: 'شحن محفظة يدوي',
  ATTACHMENT_CREATE: 'إضافة مرفق',
  ATTACHMENT_DELETE: 'حذف مرفق',
  BUNNY_VIDEO_CREATE: 'رفع فيديو',
  CODE_BATCH_CREATE: 'توليد دفعة أكواد',
  CODE_DISABLE: 'تعطيل كود',
  COURSE_CREATE: 'إنشاء كورس',
  COURSE_DELETE: 'حذف كورس',
  COURSE_PUBLISH: 'نشر/إخفاء كورس',
  COURSE_UPDATE: 'تعديل كورس',
  EXAM_CREATE: 'إنشاء امتحان',
  EXAM_DELETE: 'حذف امتحان',
  EXAM_UPDATE: 'تعديل امتحان',
  EXAM_RESULTS_RELEASE: 'إعلان نتائج',
  EXAM_RESULTS_HIDE: 'إخفاء نتائج',
  PAYMENT_FAILED: 'دفع أونلاين فاشل',
  SUBSCRIPTION_CREATE: 'اشتراك من المحفظة',
  ATTEMPT_GRADE: 'تصحيح محاولة',
  HOMEWORK_ATTACHMENT_REMOVE: 'حذف مرفق واجب',
  HOMEWORK_ATTACHMENT_SET: 'رفع مرفق واجب',
  HOMEWORK_CREATE: 'إنشاء واجب',
  HOMEWORK_DELETE: 'حذف واجب',
  HOMEWORK_GRADE: 'تصحيح واجب',
  HOMEWORK_UPDATE: 'تعديل واجب',
  LESSON_CREATE: 'إضافة حصة',
  LESSON_DELETE: 'حذف حصة',
  LESSON_REORDER: 'ترتيب الحصص',
  LESSON_UPDATE: 'تعديل حصة',
  LIVE_CREATE: 'جدولة حصة لايف',
  LIVE_DELETE: 'حذف حصة لايف',
  LIVE_UPDATE: 'تعديل حصة لايف',
  NOTIF_BROADCAST: 'إرسال جماعي',
  NOTIF_TEMPLATE_CREATE: 'إنشاء قالب',
  NOTIF_TEMPLATE_DELETE: 'حذف قالب',
  NOTIF_TEMPLATE_UPDATE: 'تعديل قالب',
  PAYMENT_INIT: 'بدء دفع أونلاين',
  PAYMENT_PAID: 'دفع أونلاين ناجح',
  PAYMENT_EXPIRED: 'انتهاء دفعات معلّقة',
  PAYMOB_WEBHOOK_FORGED: 'إشعار دفع مزوّر',
  QUESTION_CREATE: 'إضافة سؤال',
  QUESTION_DELETE: 'حذف سؤال',
  QUESTION_REORDER: 'ترتيب الأسئلة',
  QUESTION_UPDATE: 'تعديل سؤال',
  UPLOAD_IMAGE: 'رفع صورة',
  WALLET_REDEEM: 'شحن بكود',
  WALLET_REDEEM_FAILED: 'محاولة شحن فاشلة',
  USER_ACTIVATE: 'تفعيل حساب',
  USER_DEACTIVATE: 'تعطيل حساب',
  USER_PASSWORD_RESET: 'إعادة تعيين كلمة مرور',
  USER_DEVICE_REMOVE: 'إزالة جهاز',
  STAFF_CREATE: 'إضافة مساعد',
  SETTINGS_UPDATE: 'تعديل إعدادات المنصة',
};

// مفاتيح في meta قد تحمل سراً ← لا تُعرض أبداً في عارض السجل (فحص بلا حساسية لحالة الأحرف)
export const AUDIT_SECRET_KEY_RE = /password|token|secret|hash|otp|api_?key|^code$/i;
