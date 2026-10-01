import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  APP_URL: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(30).max(100_000).default(300),
  COOKIE_DOMAIN: z.string().optional(),
  // Bunny
  BUNNY_STREAM_LIBRARY_ID: z.string().default(''),
  BUNNY_STREAM_API_KEY: z.string().default(''),
  BUNNY_STREAM_CDN_HOST: z.string().default(''),
  BUNNY_TOKEN_KEY: z.string().default(''),
  // مدة صلاحية رابط التشغيل الموقّع بالثواني (افتراضياً 6 ساعات)
  BUNNY_TOKEN_TTL_SEC: z.coerce.number().int().min(60).max(24 * 60 * 60).default(6 * 60 * 60),
  // يوتيوب: مدة جلسة التشغيل قبل إعادة فحص الاشتراك (افتراضياً ساعتان)
  YOUTUBE_SESSION_TTL_SEC: z.coerce.number().int().min(60).max(24 * 60 * 60).default(2 * 60 * 60),
  BUNNY_STORAGE_ZONE: z.string().default(''),
  BUNNY_STORAGE_KEY: z.string().default(''),
  BUNNY_STORAGE_HOST: z.string().default('storage.bunnycdn.com'),
  BUNNY_STORAGE_PULL_HOST: z.string().default(''),
  // Paymob
  PAYMOB_API_KEY: z.string().default(''),
  PAYMOB_INTEGRATION_ID: z.string().default(''),
  PAYMOB_IFRAME_ID: z.string().default(''),
  PAYMOB_HMAC_SECRET: z.string().default(''),
  // الرفع المحلي (مسار نسبي لمجلد تشغيل الـ API)
  UPLOAD_DIR: z.string().default('uploads'),
  // ملفات خاصة (حلول الواجبات ومرفقاتها) — خارج أي مسار static، تُقدَّم عبر endpoint مصادَق فقط
  PRIVATE_UPLOAD_DIR: z.string().default('private-uploads'),
  // تشغيل عمّال BullMQ داخل عملية الـ API (أوقفه لو شغّلت عمّالاً منفصلين)
  JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
  // WhatsApp / SMS — بدونها: في التطوير مزوّد سجل فقط (مُقنَّع)، وفي الإنتاج تفشل الرسائل الصادرة
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_ID: z.string().default(''),
  WHATSAPP_API_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  SMS_PROVIDER_URL: z.string().default(''),
  SMS_API_KEY: z.string().default(''),
  SMS_SENDER: z.string().default('MissAnn'),
  // سقف الرسائل الصادرة في الثانية (كل العمّال معاً) — اضبطه حسب حد المزوّد
  MESSAGES_PER_SEC: z.coerce.number().int().min(1).max(200).default(20),
});

// الإنتاج: أسرار JWT قوية ومختلفة (لا قيم المثال)، والموقع عبر HTTPS (كوكي التحديث Secure)
const prodSchema = schema.superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return;
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (e[k].length < 32 || /change_me/i.test(e[k])) {
      ctx.addIssue({ code: 'custom', path: [k], message: '32 حرفاً عشوائياً على الأقل (openssl rand -hex 32)' });
    }
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'يجب أن يختلف عن JWT_ACCESS_SECRET' });
  }
  if (!e.APP_URL.startsWith('https://')) {
    ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'في الإنتاج يجب أن يبدأ بـ https://' });
  }
});

const parsed = prodSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ متغيرات البيئة غير صحيحة:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
