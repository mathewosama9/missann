import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة، برجاء المحاولة بعد دقيقة' },
});

// صارم لمنع تخمين الأكواد: 5 محاولات/دقيقة لكل طالب (يأتي بعد authGuard)
export const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : `ip:${req.ip}`),
  message: { message: 'محاولات شحن كثيرة، حاول بعد دقيقة' },
});

// تشغيل الفيديو وتتبّع التقدّم (التتبّع كل ~15 ثانية من المشغّل)
export const playbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'طلبات كثيرة، حاول بعد قليل' },
});

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// الامتحانات: الحفظ التلقائي مع كل اختيار — سقف لكل طالب (بعد authGuard)
export const examLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : `ip:${req.ip}`),
  message: { message: 'طلبات كثيرة، انتظر لحظة' },
});

// تسليم الواجبات: رفع ملف (حتى 15MB) — سقف منخفض لكل طالب
export const homeworkSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : `ip:${req.ip}`),
  message: { message: 'محاولات رفع كثيرة، حاول بعد دقيقة' },
});

// تنزيل الملفات الخاصة (حلول الطلاب ومرفقات الواجبات) لكل مستخدم — يتسع لتصحيح المس المتتابع
export const fileDownloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : `ip:${req.ip}`),
  message: { message: 'طلبات تنزيل كثيرة، حاول بعد قليل' },
});

// الإرسال الجماعي: يصل لكل الطلاب (ورسائل واتساب لها تكلفة) — سقف منخفض لكل أدمن
export const broadcastLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : `ip:${req.ip}`),
  message: { message: 'إرسال جماعي كثير، حاول بعد 10 دقائق' },
});
