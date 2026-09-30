import { Grade, CourseType, Term, WalletTxType, PaymentStatus, CodeStatus, EnrollmentSource, QuestionType, AttemptStatus, ResultRelease, LiveProvider } from './enums.js';

// معلومات المنصة والتواصل
export const PLATFORM = {
  name: 'مس آن بهاء',
  tagline: 'منصة العلوم للمرحلة الابتدائية',
  subject: 'العلوم',
  bookingPhone: '01204671241',
  whatsapp: '201204671241',
} as const;

export const GRADE_LABELS: Record<Grade, string> = {
  FOURTH_PRIMARY: 'الصف الرابع الابتدائي',
  FIFTH_PRIMARY: 'الصف الخامس الابتدائي',
  SIXTH_PRIMARY: 'الصف السادس الابتدائي',
};

export const GRADE_SHORT: Record<Grade, string> = {
  FOURTH_PRIMARY: 'رابعة ابتدائي',
  FIFTH_PRIMARY: 'خامسة ابتدائي',
  SIXTH_PRIMARY: 'سادسة ابتدائي',
};

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  MONTHLY: 'اشتراك شهري',
  FOUNDATION: 'كورس تأسيسي',
  REVISION: 'مراجعة',
};

export const TERM_LABELS: Record<Term, string> = {
  FIRST: 'الترم الأول',
  SECOND: 'الترم الثاني',
};

// المحافظات المصرية
export const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'المنوفية',
  'القليوبية', 'البحيرة', 'الغربية', 'بورسعيد', 'دمياط', 'الإسماعيلية',
  'السويس', 'كفر الشيخ', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط',
  'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد',
  'مطروح', 'شمال سيناء', 'جنوب سيناء',
] as const;

// حدود رفع الملفات
export const UPLOAD_LIMITS = {
  imageMaxBytes: 5 * 1024 * 1024, // 5MB
  pdfMaxBytes: 20 * 1024 * 1024, // 20MB
  homeworkMaxBytes: 15 * 1024 * 1024, // 15MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedDocTypes: ['application/pdf'],
};

// تحويل القرش <-> الجنيه
export const piastresToEGP = (p: number): number => p / 100;
export const egpToPiastres = (e: number): number => Math.round(e * 100);
export const formatEGP = (piastres: number): string =>
  `${piastresToEGP(piastres).toLocaleString('ar-EG', { minimumFractionDigits: 0 })} ج.م`;

// نسبة المشاهدة الدنيا لاحتساب "تم إكمال الحصة" (نجمة التحفيز)
export const LESSON_COMPLETE_MIN_PERCENT = 70;

// ── المحفظة والاشتراكات ─────────────────────────────────────────
// مدة الوصول لكل اشتراك (بالأيام): الشهري يُجدَّد، الباقي شراء لمرة واحدة لمدة عام دراسي
export const ENROLLMENT_DAYS: Record<CourseType, number> = {
  MONTHLY: 30,
  FOUNDATION: 365,
  REVISION: 365,
};

// حدود الشحن الأونلاين (بالقرش)
export const TOPUP_LIMITS = { min: 50 * 100, max: 5000 * 100 };

export const WALLET_TX_LABELS: Record<WalletTxType, string> = {
  TOPUP: 'شحن',
  PURCHASE: 'اشتراك',
  REFUND: 'استرداد',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'قيد الانتظار',
  PAID: 'مدفوع',
  FAILED: 'فشل',
};

export const CODE_STATUS_LABELS: Record<CodeStatus, string> = {
  ACTIVE: 'متاح',
  USED: 'مستخدم',
  DISABLED: 'معطّل',
};

export const ENROLLMENT_SOURCE_LABELS: Record<EnrollmentSource, string> = {
  CODE: 'كود',
  ONLINE: 'دفع أونلاين',
  ADMIN: 'الإدارة',
  WALLET: 'المحفظة',
  FREE: 'مجاني',
};

// ── كروت الشحن ─────────────────────────────────────────────────
// 16 حرفاً من أبجدية بلا حروف ملتبسة (0/O، 1/I/L) ≈ 79 بت عشوائية، تُعرض كـ XXXX-XXXX-XXXX-XXXX
export const REDEEM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REDEEM_CODE_LENGTH = 16;

// توحيد الكود قبل التجزئة: أحرف كبيرة بدون مسافات أو شرطات
export const normalizeRedeemCode = (code: string): string =>
  code.toUpperCase().replace(/[\s-]/g, '');

export const formatRedeemCode = (code: string): string =>
  normalizeRedeemCode(code).match(/.{1,4}/g)?.join('-') ?? '';

// ── الامتحانات ──────────────────────────────────────────────────
// سماحية شبكة بعد الـ deadline للحفظ/التسليم (تأخّر وصول الطلب عند التسليم التلقائي عند الصفر)
export const EXAM_GRACE_SEC = 5;
// تحذير الطالب قبل انتهاء الوقت
export const EXAM_WARN_SEC = 60;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ: 'اختيار من متعدد',
  TRUEFALSE: 'صح أو خطأ',
  ESSAY: 'مقالي',
  COMPLETE: 'أكمل',
  TERM: 'اذكر المصطلح العلمي',
};

// الأسئلة الكتابية: الطالب يكتب الإجابة والمس تصحّحها يدوياً
export const MANUAL_QUESTION_TYPES: readonly QuestionType[] = ['ESSAY', 'COMPLETE', 'TERM'];
export const isManualQuestion = (type: QuestionType): boolean => MANUAL_QUESTION_TYPES.includes(type);
// أقصى طول لإجابة الطالب الكتابية
export const ANSWER_TEXT_MAX: Record<QuestionType, number> = {
  MCQ: 0,
  TRUEFALSE: 0,
  ESSAY: 3000,
  COMPLETE: 300,
  TERM: 300,
};

export const RESULT_RELEASE_LABELS: Record<ResultRelease, string> = {
  IMMEDIATE: 'فور التسليم',
  AFTER_END: 'بعد انتهاء موعد الامتحان',
  MANUAL: 'عندما أعلنها بنفسي',
};

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  IN_PROGRESS: 'جارٍ',
  SUBMITTED: 'تم التسليم',
  EXPIRED: 'انتهى الوقت',
};

export const TRUEFALSE_CHOICES = ['صح', 'خطأ'] as const;

// نسبة مئوية صحيحة (بلا كسور) من الدرجة
export const scorePercent = (score: number, total: number): number =>
  total > 0 ? Math.round((score / total) * 100) : 0;

// نجوم التحفيز: 3 للممتاز، 2 للجيد جداً، 1 للنجاح، 0 دون النجاح
export function examStars(percent: number, passScore: number): number {
  if (percent < passScore) return 0;
  if (percent >= 90) return 3;
  if (percent >= 75) return 2;
  return 1;
}

// ── الواجبات ────────────────────────────────────────────────────
// سياسة التسليم (تُفرض في الخادم وتُعرض في الواجهة — غيّرها من هنا فقط):
// - resubmitUntilGraded: يستبدل الطالب ملفه بحرية حتى تصحّحه المس، وبعد التصحيح يُقفل التسليم
// - allowLate: التسليم بعد الموعد مقبول لكن يُعلَّم «متأخر»؛ false ← يُرفض بعد dueAt
export const HOMEWORK_POLICY = { resubmitUntilGraded: true, allowLate: true } as const;

// أنواع ملف الحل المقبولة (يُتحقق من المحتوى في الخادم لا من الامتداد): PDF أو صورة
export const HOMEWORK_FILE_TYPES = [...UPLOAD_LIMITS.allowedDocTypes, ...UPLOAD_LIMITS.allowedImageTypes];
export const HOMEWORK_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';
export const HOMEWORK_MAX_GRADE_DEFAULT = 10;

// ── الحصص اللايف ────────────────────────────────────────────────
// نافذة الانضمام: من (البداية − 15 دقيقة) حتى (البداية + المدة). خارجها لا يُرسَل joinUrl إطلاقاً.
export const LIVE_JOIN_EARLY_MIN = 15;
// تذكير المشتركين قبل البداية (إشعار داخلي + واتساب)
export const LIVE_REMINDER_BEFORE_MIN = 60;

export const LIVE_PROVIDER_LABELS: Record<LiveProvider, string> = {
  ZOOM: 'Zoom',
  MEET: 'Google Meet',
};

// المضيفون المسموحون لكل مزوّد (النطاق نفسه أو نطاق فرعي منه) — يمنع روابط التصيّد
export const LIVE_PROVIDER_HOSTS: Record<LiveProvider, readonly string[]> = {
  ZOOM: ['zoom.us'],
  MEET: ['meet.google.com'],
};

// https فقط، بلا بيانات دخول أو منفذ مخصّص، والمضيف في قائمة المزوّد المختار
export function isAllowedJoinUrl(raw: string, provider: LiveProvider): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return LIVE_PROVIDER_HOSTS[provider].some((h) => host === h || host.endsWith(`.${h}`));
}

// الصيغة القياسية للرابط (مخطط/مضيف بأحرف صغيرة، بلا مسافات/tabs مخفية): ما يُفحص هو ما يُخزَّن ويُرسَل
export function normalizeJoinUrl(raw: string): string {
  try {
    return new URL(raw).href;
  } catch {
    return raw;
  }
}

export function liveJoinWindow(startAt: Date, durationMin: number): { opensAt: Date; endsAt: Date } {
  return {
    opensAt: new Date(startAt.getTime() - LIVE_JOIN_EARLY_MIN * 60_000),
    endsAt: new Date(startAt.getTime() + durationMin * 60_000),
  };
}
