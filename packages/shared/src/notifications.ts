import type { BroadcastAudience, NotifChannel, NotifStatus, NotifType } from './enums.js';

// ── الإشعارات والقوالب ──────────────────────────────────────────

// تنبيه قرب انتهاء الاشتراك: قبل الانتهاء بهذه المدة (cron يومي، مرة واحدة لكل اشتراك لكل تاريخ انتهاء)
export const EXPIRY_WARN_DAYS = 3;
// جرس الإشعارات: فترة تحديث العدّاد (والتحديث أيضاً عند العودة للتبويب)
export const NOTIF_POLL_MS = 60_000;
// عدد العناصر في قائمة الجرس المنسدلة
export const NOTIF_BELL_SIZE = 8;

export const NOTIF_TYPE_LABELS: Record<NotifType, string> = {
  GENERAL: 'إعلان',
  OTP: 'كود تحقق',
  PARENT_EXAM_RESULT: 'نتيجة لولي الأمر',
  LIVE_REMINDER: 'تذكير حصة لايف',
  ENROLLMENT_EXPIRY: 'انتهاء اشتراك',
};

export const NOTIF_CHANNEL_LABELS: Record<NotifChannel, string> = {
  IN_APP: 'داخل المنصة',
  WHATSAPP: 'واتساب',
  SMS: 'SMS',
};

export const NOTIF_STATUS_LABELS: Record<NotifStatus, string> = {
  PENDING: 'قيد الإرسال',
  SENT: 'أُرسلت',
  FAILED: 'فشلت',
};

export const BROADCAST_AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  ALL: 'كل الطلاب',
  GRADE: 'صف دراسي',
  COURSE: 'مشتركو كورس',
};

// ── القوالب ──────────────────────────────────────────────────────
// المتغيّرات بصيغة {name}: استبدال نصي فقط (لا تقييم كود ولا HTML)، وأي متغيّر خارج قائمة
// القالب يُرفض عند الحفظ. نص واتساب يُستخدم أيضاً كبديل SMS.
export const TEMPLATE_CHANNELS = ['IN_APP', 'WHATSAPP'] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const TEMPLATE_KEY_RE = /^[a-z][a-z0-9_]{2,39}$/;
export const TEMPLATE_BODY_MAX = 1000;
export const TEMPLATE_TITLE_MAX = 160;
// القوالب المخصّصة (للإرسال الجماعي) محدودة العدد ← القائمة صغيرة وتُعرض كاملة
export const CUSTOM_TEMPLATES_MAX = 50;
const VAR_RE = /\{([a-z_]+)\}/g;

interface TemplateContent {
  title: string;
  body: string;
}

interface TemplateSpec {
  label: string;
  vars: readonly string[];
  required: readonly string[];
  defaults: Partial<Record<TemplateChannel, TemplateContent>>;
}

export const SYSTEM_TEMPLATES = {
  otp: {
    label: 'كود التحقق (تفعيل الحساب / استعادة كلمة المرور)',
    vars: ['code'],
    required: ['code'],
    defaults: {
      WHATSAPP: {
        title: 'كود التحقق',
        body: 'كود التحقق الخاص بك في منصة مس آن بهاء: {code}\nصالح لمدة 10 دقائق. لا تشاركه مع أي شخص.',
      },
    },
  },
  parent_exam_result: {
    label: 'نتيجة امتحان لولي الأمر',
    vars: ['name', 'score', 'total', 'exam'],
    required: ['name', 'score', 'total', 'exam'],
    defaults: {
      WHATSAPP: { title: 'نتيجة امتحان', body: 'ابنك/بنتك {name} حصل على {score}/{total} في امتحان {exam}' },
    },
  },
  live_reminder: {
    label: 'تذكير حصة لايف (قبل الموعد بساعة)',
    vars: ['name', 'title', 'time'],
    required: ['title', 'time'],
    defaults: {
      IN_APP: { title: 'حصة لايف بعد ساعة', body: 'حصة «{title}» تبدأ الساعة {time}. رابط الانضمام يظهر في صفحة الحصص اللايف قبل الموعد بربع ساعة.' },
      WHATSAPP: { title: 'تذكير حصة لايف', body: 'أهلاً {name}، تذكير: حصة «{title}» اللايف تبدأ الساعة {time}. ادخل من صفحة الحصص اللايف على منصة مس آن بهاء.' },
    },
  },
  enrollment_expiry: {
    label: 'قرب انتهاء الاشتراك',
    vars: ['name', 'course', 'date'],
    required: ['course', 'date'],
    defaults: {
      IN_APP: { title: 'اشتراكك قارب على الانتهاء', body: 'اشتراكك في «{course}» ينتهي يوم {date}. جدّد الاشتراك حتى لا تتوقف الحصص.' },
      WHATSAPP: { title: 'انتهاء الاشتراك', body: 'أهلاً {name}، اشتراكك في «{course}» على منصة مس آن بهاء ينتهي يوم {date}. جدّد الاشتراك حتى لا تتوقف الحصص.' },
    },
  },
} as const satisfies Record<string, TemplateSpec>;
export type SystemTemplateKey = keyof typeof SYSTEM_TEMPLATES;

// القوالب المخصّصة والإرسال الجماعي: اسم المستلم فقط
export const CUSTOM_TEMPLATE_VARS = ['name'] as const;

export const isSystemTemplate = (key: string): key is SystemTemplateKey => Object.hasOwn(SYSTEM_TEMPLATES, key);

// المتغيّرات والقنوات المسموحة لمفتاح
export function templateSpec(key: string): { vars: readonly string[]; required: readonly string[]; channels: readonly TemplateChannel[] } {
  if (!isSystemTemplate(key)) return { vars: CUSTOM_TEMPLATE_VARS, required: [], channels: TEMPLATE_CHANNELS };
  const s: TemplateSpec = SYSTEM_TEMPLATES[key];
  return { vars: s.vars, required: s.required, channels: Object.keys(s.defaults) as TemplateChannel[] };
}

// النص الافتراضي لقالب نظام على قناة (undefined للمخصّص أو قناة غير مدعومة)
export function templateDefault(key: string, channel: TemplateChannel): TemplateContent | undefined {
  return isSystemTemplate(key) ? (SYSTEM_TEMPLATES[key] as TemplateSpec).defaults[channel] : undefined;
}

export function templateVars(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(VAR_RE), (m) => m[1]!))];
}

// أخطاء المتغيّرات لكل حقل (فارغ = سليم): متغيّر غير معروف، أو متغيّر إلزامي ناقص من النص
export function templateVarErrors(vars: readonly string[], required: readonly string[], content: TemplateContent): Partial<Record<keyof TemplateContent, string>> {
  const errors: Partial<Record<keyof TemplateContent, string>> = {};
  for (const field of ['title', 'body'] as const) {
    const unknown = templateVars(content[field]).filter((v) => !vars.includes(v));
    if (unknown.length) errors[field] = `متغيّر غير مسموح: {${unknown[0]}} — المسموح: ${vars.map((v) => `{${v}}`).join(' ') || 'لا شيء'}`;
  }
  const missing = required.filter((v) => !content.body.includes(`{${v}}`));
  if (missing.length && !errors.body) errors.body = `النص يجب أن يحتوي على: ${missing.map((v) => `{${v}}`).join(' ')}`;
  return errors;
}

// قيمة متغيّر: نص عادي بسطر واحد وطول محدود (لا أحرف تحكم تكسر شكل الرسالة)
const cleanValue = (v: string | number) =>
  String(v)
    // eslint-disable-next-line no-control-regex -- إزالة محارف التحكم من القيم عمداً
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 120);

// الاستبدال في تمريرة واحدة: القيم لا يُعاد فحصها (اسم يحتوي "{code}" يبقى نصاً)
export function renderTemplate(text: string, values: Record<string, string | number>): string {
  return text.replace(VAR_RE, (whole, key: string) => (Object.hasOwn(values, key) ? cleanValue(values[key]!) : whole));
}
