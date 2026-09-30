import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { logger, maskPhone } from './logger.js';
import type { OtpPurpose } from '@miss-ann/shared';

export const OTP_TTL_MIN = 10;
// سقف الأكواد لكل رقم وغرض خلال النافذة: يمنع إغراق رقم برسائل (كل رسالة لها تكلفة)
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MIN = 15;

const hashCode = (code: string): string =>
  crypto.createHash('sha256').update(code).digest('hex');

// إنشاء كود OTP وتخزينه مجزّأً فقط؛ الكود يُرجَع للمستدعي ليُرسَل (لا يُسجَّل أبداً).
// null = تجاوز السقف لهذا الرقم (المستدعي لا يكشف ذلك للعميل)
export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<string | null> {
  const since = new Date(Date.now() - OTP_WINDOW_MIN * 60 * 1000);
  const recent = await prisma.otp.count({ where: { phone, purpose, createdAt: { gt: since } } });
  if (recent >= OTP_MAX_PER_WINDOW) {
    logger.warn({ to: maskPhone(phone), purpose }, 'تجاوز سقف أكواد التحقق لهذا الرقم');
    return null;
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otp.create({
    data: {
      phone,
      purpose,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
    },
  });
  return code;
}

// التحقق من الكود واستهلاكه (أحدث كود صالح غير مستهلك)
export async function consumeOtp(
  phone: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> {
  const otp = await prisma.otp.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.codeHash !== hashCode(code)) return false;
  await prisma.otp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return true;
}
