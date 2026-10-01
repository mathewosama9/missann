import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { env } from './env.js';
import { badRequest, notFound } from './http.js';
import { logger } from './logger.js';
import { privateStorage, type StoredExt } from './storage.js';

// مجلد الرفع خارج كود التطبيق (مُستثنى من git) — يُستبدل بـ Bunny Storage عند توفّر المفاتيح
export const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR);

// تقديم الملفات المرفوعة: أسماء عشوائية ثابتة ← كاش طويل؛ لا فهارس ولا ملفات مخفية
export const uploadsStatic = express.static(UPLOAD_DIR, {
  index: false,
  dotfiles: 'deny',
  immutable: true,
  maxAge: '30d',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
});

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`;

// ── رفع ملف واحد في الذاكرة بحد حجم صارم (الذاكرة محدودة بالحد) ─────
// فلترة النوع المُعلَن هنا رفض مبكر فقط؛ الحكم النهائي على المحتوى في normalizeDocOrImage
export function singleFileUpload(field: string, maxBytes: number, allowedTypes: readonly string[], typeError: string) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 },
    // أسماء الملفات العربية تصل UTF-8
    defParamCharset: 'utf8',
    fileFilter: (_req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) cb(null, true);
      else cb(badRequest(typeError));
    },
  } as multer.Options);
  return (req: Request, res: Response, next: NextFunction) =>
    upload.single(field)(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? `حجم الملف أكبر من ${mb(maxBytes)}` : 'ملف غير صالح'));
      }
      next(err);
    });
}

// ── التحقق من المحتوى لا من الامتداد ─────────────────────────────
export interface NormalizedFile {
  data: Buffer;
  mime: 'application/pdf' | 'image/webp';
  ext: StoredExt;
}

const PDF_MAGIC = Buffer.from('%PDF-');
export const isPdf = (buf: Buffer): boolean => buf.length > PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
// حارس decompression bomb: أبعاد الصورة المفكوكة محدودة قبل أي معالجة
const MAX_INPUT_PIXELS = 40_000_000;

const notDocOrImage = () => badRequest('الملف ليس PDF أو صورة صالحة — ارفع ملف PDF أو صورة JPG/PNG/WEBP');

// PDF ← بالبايتات السحرية كما هو. صورة ← تُفك وتُعاد ترميزها WebP (تمسح EXIF وأي حمولة مخفية).
// أي شيء آخر (نص بامتداد pdf، SVG، GIF…) ← 400 عربي.
export async function normalizeDocOrImage(
  buf: Buffer,
  limits: { pdfMaxBytes: number; imageMaxBytes: number },
): Promise<NormalizedFile> {
  if (isPdf(buf)) {
    if (buf.length > limits.pdfMaxBytes) throw badRequest(`حجم ملف PDF أكبر من ${mb(limits.pdfMaxBytes)}`);
    return { data: buf, mime: 'application/pdf', ext: 'pdf' };
  }
  if (buf.length > limits.imageMaxBytes) throw badRequest(`حجم الصورة أكبر من ${mb(limits.imageMaxBytes)}`);
  try {
    const img = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !IMAGE_FORMATS.has(meta.format)) throw notDocOrImage();
    const data = await img
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { data, mime: 'image/webp', ext: 'webp' };
  } catch {
    throw notDocOrImage();
  }
}

// اسم عرض آمن للتنزيل: بلا مسارات أو محارف تحكّم، بامتداد المحتوى الحقيقي
export function safeDisplayName(original: string, ext: StoredExt): string {
  const base = path
    .basename(original || '')
    .replace(/\.[^.]*$/, '')
    // eslint-disable-next-line no-control-regex -- إزالة محارف التحكم من اسم الملف عمداً
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, '')
    .trim()
    .slice(0, 80);
  return `${base || 'file'}.${ext}`;
}

// ── تقديم ملف خاص: stream (بلا تحميل كامل في الذاكرة) + رؤوس منع الكاش والتخمين ─
export async function sendPrivateFile(res: Response, file: { key: string; mime: string; name: string }): Promise<void> {
  const obj = await privateStorage.open(file.key);
  if (!obj) throw notFound('الملف غير موجود');
  res.attachment(file.name);
  res.set({
    'Content-Type': file.mime,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (obj.size) res.set('Content-Length', String(obj.size));
  try {
    await pipeline(obj.stream, res);
  } catch (err) {
    // انقطاع العميل أثناء التنزيل ليس خطأ خادم
    logger.debug({ err: (err as Error).message }, 'انقطع تنزيل ملف خاص');
    obj.stream.destroy();
  }
}
