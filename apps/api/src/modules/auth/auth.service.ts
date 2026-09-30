import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { OtpPurpose, Role } from '@miss-ann/shared';
import type {
  RegisterInput,
  LoginInput,
  ResetPasswordInput,
  AuthResponse,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiry,
} from '../../lib/tokens.js';
import { issueOtp, consumeOtp } from '../../lib/otp.js';
import { queueOtpMessage } from '../notifications/producers.js';
import { setRefreshCookie, clearRefreshCookie } from '../../lib/cookies.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/http.js';
import { audit, auditTx } from '../../lib/audit.js';
import { getPlatformSettings } from '../settings/settings.service.js';
import { forgetUserStatus, revokeSessions } from '../../lib/userStatus.js';

type UserRow = Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>;

// hash ثابت لكلمة عشوائية — للتحقق الوهمي عند رقم غير مسجّل. يُحسب عند التحميل (أول طلب لا يدفع
// تكلفة مضاعفة تكشفه)، وفشله لا يُخزَّن (يُعاد الحساب في الطلب التالي بدل 500 دائم)
let dummy: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword(crypto.randomUUID()).catch((err: unknown) => {
    dummy = undefined;
    throw err;
  });
  return dummy;
}
void dummyHash().catch(() => undefined);

// توكن مُدوَّر يعود بعد هذه المهلة = نسخة مسروقة (لا سباق تبويبات) ← تُنهى كل جلسات المستخدم
const REUSE_GRACE_MS = 30_000;

// كود تحقق جديد ← رسالة واتساب/SMS عبر الطابور (لا يحجب الطلب ولا يُسجَّل الكود)
async function sendOtp(userId: number, phone: string, purpose: OtpPurpose): Promise<void> {
  const code = await issueOtp(phone, purpose);
  if (code) await queueOtpMessage(userId, phone, code);
}

function toAuthUser(u: UserRow): AuthResponse['user'] {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    grade: u.grade,
    governorate: u.governorate,
  };
}

// ── تسجيل طالب جديد ─────────────────────────────────────────────
// التحقق بالكود يحدده الأدمن من إعدادات المنصة: معطَّل ← الحساب مفعّل فوراً ولا تُرسل رسالة
export async function register(input: RegisterInput): Promise<{ phone: string; requiresVerification: boolean }> {
  const email = input.email ? input.email.toLowerCase() : null;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(email ? [{ email }] : [])] },
    select: { phone: true, email: true },
  });
  if (existing?.phone === input.phone) throw conflict('رقم الموبايل مسجّل بالفعل');
  if (email && existing?.email === email) throw conflict('البريد الإلكتروني مسجّل بالفعل');

  const passwordHash = await hashPassword(input.password);
  const { requirePhoneVerification } = await getPlatformSettings();
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      parentPhone: input.parentPhone,
      email,
      passwordHash,
      grade: input.grade,
      governorate: input.governorate,
      role: Role.STUDENT,
      isActive: !requirePhoneVerification,
      wallet: { create: { balance: 0 } },
    },
  });

  if (requirePhoneVerification) await sendOtp(user.id, input.phone, OtpPurpose.ACTIVATION);
  return { phone: input.phone, requiresVerification: requirePhoneVerification };
}

// ── تفعيل الحساب عبر OTP ────────────────────────────────────────
export async function verifyActivation(phone: string, code: string): Promise<void> {
  const ok = await consumeOtp(phone, code, OtpPurpose.ACTIVATION);
  if (!ok) throw badRequest('كود التفعيل غير صحيح أو منتهٍ');
  const u = await prisma.user.update({ where: { phone }, data: { isActive: true }, select: { id: true } });
  forgetUserStatus(u.id);
}

// ── إصدار توكنات وتسجيل توكن التحديث ────────────────────────────
async function issueSession(user: UserRow, res: Response, remember: boolean): Promise<AuthResponse> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    grade: user.grade ?? undefined,
    name: user.name,
  });
  const { token, hash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: refreshExpiry(remember), remember },
  });
  setRefreshCookie(res, token, remember);
  return { accessToken, user: toAuthUser(user) };
}

// ── تسجيل الدخول مع فحص حد الأجهزة ──────────────────────────────
export async function login(input: LoginInput, req: Request, res: Response): Promise<AuthResponse> {
  const identifier = input.identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: input.identifier }, { email: identifier }] },
  });
  // رقم غير مسجّل يمر بنفس تكلفة argon2 ← زمن الرد لا يكشف وجود الحساب
  const passOk = await verifyPassword(user?.passwordHash ?? (await dummyHash()), input.password);
  if (!user || !passOk) throw unauthorized('بيانات الدخول غير صحيحة');
  if (!user.isActive) throw forbidden('الحساب غير مُفعّل، أكمل التفعيل عبر الكود');

  // فحص/تسجيل الجهاز ضمن الحد المسموح
  const existingDevice = await prisma.device.findUnique({
    where: { userId_deviceFingerprint: { userId: user.id, deviceFingerprint: input.deviceFingerprint } },
  });
  if (!existingDevice) {
    const count = await prisma.device.count({ where: { userId: user.id } });
    // حد الأجهزة للطلاب فقط (منع مشاركة حساب مدفوع)؛ الأدمن والمساعد بلا حد (أجهزتهم تُسجَّل للمتابعة)
    if (user.role === Role.STUDENT && count >= user.deviceLimit) {
      throw forbidden('تم الوصول للحد الأقصى للأجهزة. أزل جهازاً من حسابك للمتابعة');
    }
    await prisma.device.create({
      data: {
        userId: user.id,
        deviceFingerprint: input.deviceFingerprint,
        userAgent: req.headers['user-agent'] ?? '',
        ip: req.ip ?? '',
      },
    });
  } else {
    await prisma.device.update({
      where: { id: existingDevice.id },
      data: { lastSeen: new Date(), ip: req.ip ?? '' },
    });
  }

  await audit(req, 'LOGIN', 'User', { userId: user.id });
  return issueSession(user, res, input.rememberMe);
}

// ── تجديد التوكن (rotation) ─────────────────────────────────────
export async function refresh(rawToken: string | undefined, res: Response): Promise<{ accessToken: string }> {
  if (!rawToken) throw unauthorized('جلسة منتهية');
  const hash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
  const invalid = () => {
    clearRefreshCookie(res);
    return unauthorized('جلسة غير صالحة');
  };
  // إعادة استخدام توكن مُدوَّر بعد مهلة السباق: أحد الطرفين (المستخدم أو السارق) يحمل نسخة قديمة
  // ← إنهاء كل الجلسات فلا يبقى السارق داخلاً بالسلسلة الجديدة
  if (stored?.rotated && stored.revokedAt && Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
    await prisma.$transaction(async (tx) => {
      await revokeSessions(tx, stored.userId);
      await auditTx(tx, null, 'REFRESH_TOKEN_REUSE', 'User', { userId: stored.userId, tokenId: stored.id });
    });
    forgetUserStatus(stored.userId);
    throw invalid();
  }
  // الحساب المعطَّل لا يجدّد جلسته (التعطيل يُبطل التوكنات أيضاً، وهذا خط دفاع ثانٍ)
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    throw invalid();
  }

  // إبطال القديم وإصدار جديد (rotation) بنفس اختيار "تذكّرني" — المُتذكَّرة تمتد 30 يوماً مع كل تجديد،
  // وغير المُتذكَّرة تحتفظ بانتهائها الأصلي (لا تمديد)
  const { token, hash: newHash } = generateRefreshToken();
  const expiresAt = stored.remember ? refreshExpiry() : stored.expiresAt;
  // الإبطال مشروط (revokedAt=null): تجديدان متزامنان بنفس التوكن ← واحد فقط يصدر توكناً جديداً
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), rotated: true },
    });
    if (count === 0) throw invalid();
    await tx.refreshToken.create({
      data: { userId: stored.userId, tokenHash: newHash, expiresAt, remember: stored.remember },
    });
  });
  setRefreshCookie(res, token, stored.remember);

  const accessToken = signAccessToken({
    sub: stored.user.id,
    role: stored.user.role,
    grade: stored.user.grade ?? undefined,
    name: stored.user.name,
  });
  return { accessToken };
}

// ── تسجيل الخروج ────────────────────────────────────────────────
export async function logout(rawToken: string | undefined, res: Response): Promise<void> {
  if (rawToken) {
    await prisma.refreshToken
      .updateMany({ where: { tokenHash: hashToken(rawToken) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  clearRefreshCookie(res);
}

// ── نسيان/إعادة تعيين كلمة المرور ──────────────────────────────
export async function forgotPassword(phone: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone } });
  // لا نكشف إن كان الرقم مسجّلاً أم لا (منع تعداد الحسابات)
  if (user) await sendOtp(user.id, phone, OtpPurpose.RESET);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const ok = await consumeOtp(input.phone, input.code, OtpPurpose.RESET);
  if (!ok) throw badRequest('كود الاستعادة غير صحيح أو منتهٍ');
  const passwordHash = await hashPassword(input.newPassword);
  // إنهاء كل الجلسات القديمة (التحديث والوصول)
  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { phone: input.phone }, data: { passwordHash }, select: { id: true } });
    await revokeSessions(tx, user.id);
    return user.id;
  });
  forgetUserStatus(userId);
}

// ── بيانات المستخدم الحالي ──────────────────────────────────────
export async function me(userId: number): Promise<AuthResponse['user']> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('المستخدم غير موجود');
  return toAuthUser(user);
}

// ── إدارة الأجهزة ───────────────────────────────────────────────
export async function listDevices(userId: number) {
  return prisma.device.findMany({
    where: { userId },
    orderBy: { lastSeen: 'desc' },
    select: { id: true, userAgent: true, ip: true, lastSeen: true, createdAt: true },
  });
}

// الجلسات غير مربوطة بالأجهزة ← إزالة جهاز تُنهي كل الجلسات الأخرى (الجهاز المسروق يخرج)، وتبقى الحالية
export async function removeDevice(userId: number, deviceId: number, currentRawToken?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.device.deleteMany({ where: { id: deviceId, userId } });
    if (count === 0) throw notFound('الجهاز غير موجود');
    await revokeSessions(tx, userId, { keepTokenHash: currentRawToken ? hashToken(currentRawToken) : undefined });
  });
  forgetUserStatus(userId);
}

// ── تغيير كلمة المرور (من داخل الحساب) ─────────────────────────
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  currentRawToken?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('المستخدم غير موجود');
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw badRequest('كلمة المرور الحالية غير صحيحة');
  const passwordHash = await hashPassword(newPassword);
  // كلمة مرور جديدة ← خروج كل الأجهزة الأخرى (الحالية تبقى وتجدّد توكن الوصول تلقائياً)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await revokeSessions(tx, userId, { keepTokenHash: currentRawToken ? hashToken(currentRawToken) : undefined });
  });
  forgetUserStatus(userId);
}
