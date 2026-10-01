import { createRequire } from 'node:module';
import pino from 'pino';
import { isProd, isTest } from './env.js';

// نستخدم pino-pretty في التطوير فقط وإن كان مثبّتاً — وإلا نرجع لـ JSON بدون كسر الإقلاع
function prettyTransport(): pino.TransportSingleOptions | undefined {
  if (isProd) return undefined;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } };
  } catch {
    return undefined;
  }
}

// أسرار لا تُكتب في السجلات: توكن الوصول، الكوكيز (الطلب)، وكوكي التحديث الخام في ترويسة الرد
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
];

export const logger = pino({
  // الاختبارات: الأخطاء فقط حتى لا تغرق النتائج بسجلات الطلبات
  level: isTest ? 'error' : isProd ? 'info' : 'debug',
  transport: prettyTransport(),
  redact: {
    paths: LOG_REDACT_PATHS,
    censor: '[محجوب]',
  },
});

// الأرقام في السجلات مُقنَّعة دائماً: 010*****678
export const maskPhone = (p: string) => `${p.slice(0, 3)}*****${p.slice(-3)}`;
