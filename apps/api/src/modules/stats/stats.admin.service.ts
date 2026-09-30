import { STATS_DAYS, STATS_LATEST, type AdminStatsDTO, type RevenueSplit } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { cached } from '../../lib/cache.js';

// ── إحصائيات لوحة الأدمن ─────────────────────────────────────────
// كل تجميعة على فهرس: عدّ الطلاب (role,createdAt)، الاشتراكات السارية (expiresAt)، الأكواد المستخدمة (status)،
// الإيراد اليومي أونلاين (status,paidAt) وبالكروت (usedAt)، الاشتراكات الجديدة (Enrollment.createdAt)،
// وأحدث الاشتراكات/المدفوعات (createdAt). النتيجة في كاش Redis قصير (لوحة تُفتح كثيراً، والدقة بالدقيقة تكفي).
// الإيراد = دفع أونلاين مؤكَّد (PAID) + قيمة كروت الشحن المستخدمة؛ الشحن اليدوي من الإدارة لا يُحتسب (نقدي خارج المنصة).

export const STATS_CACHE_KEY = 'cache:admin-stats:v1';
const STATS_TTL_SEC = 60;
const TZ = 'Africa/Cairo';

// YYYY-MM-DD لتاريخ القاهرة
const cairoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

// فرق توقيت القاهرة عن UTC (بالدقائق) عند لحظة معيّنة (يراعي التوقيت الصيفي)
function cairoOffsetMin(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(d.getTime() / 60_000) * 60_000) / 60_000);
}

// بداية يوم القاهرة (YYYY-MM-DD) كلحظة UTC
export function cairoMidnight(day: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - cairoOffsetMin(utcMidnight) * 60_000);
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type DayRow = { day: string; v: bigint | number };
const toMap = (rows: DayRow[]) => new Map(rows.map((r) => [r.day, Number(r.v)]));

// الأعمدة timestamp بلا منطقة (UTC)، وجلسة القاعدة قد تكون بمنطقة أخرى ← التحويل صريح في الاتجاهين
export async function computeStats(now = new Date()): Promise<AdminStatsDTO> {
  const today = cairoDay(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const firstChartDay = addDays(today, -(STATS_DAYS - 1));
  const fromDay = monthStart < firstChartDay ? monthStart : firstChartDay;
  const since = cairoMidnight(fromDay).toISOString();

  const [students, activeEnrollments, usedCodes, online, codes, enrollments, newStudents, byGrade, latestEnrollments, latestPayments] =
    await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.enrollment.count({ where: { expiresAt: { gt: now } } }),
      prisma.redeemCode.count({ where: { status: 'USED' } }),
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS day, SUM("amount")::bigint AS v
        FROM "Payment"
        WHERE "status" = 'PAID' AND "paidAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char(("usedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS day, SUM("value")::bigint AS v
        FROM "RedeemCode"
        WHERE "usedAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS v
        FROM "Enrollment"
        WHERE "createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS v
        FROM "User"
        WHERE "role" = 'STUDENT' AND "createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY 1`,
      prisma.user.groupBy({ by: ['grade'], where: { role: 'STUDENT' }, _count: { _all: true } }),
      prisma.enrollment.findMany({
        orderBy: { createdAt: 'desc' },
        take: STATS_LATEST,
        select: {
          id: true,
          source: true,
          createdAt: true,
          expiresAt: true,
          user: { select: { id: true, name: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: STATS_LATEST,
        select: {
          id: true,
          amount: true,
          status: true,
          purpose: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          course: { select: { title: true } },
        },
      }),
    ]);

  const onlineBy = toMap(online);
  const codesBy = toMap(codes);
  const enrollBy = toMap(enrollments);
  const studentsBy = toMap(newStudents);

  const split = (days: string[]): RevenueSplit => {
    const o = days.reduce((s, d) => s + (onlineBy.get(d) ?? 0), 0);
    const c = days.reduce((s, d) => s + (codesBy.get(d) ?? 0), 0);
    return { online: o, codes: c, total: o + c };
  };
  const monthDays: string[] = [];
  for (let d = monthStart; d <= today; d = addDays(d, 1)) monthDays.push(d);

  const daily = Array.from({ length: STATS_DAYS }, (_, i) => {
    const day = addDays(firstChartDay, i);
    return {
      day,
      online: onlineBy.get(day) ?? 0,
      codes: codesBy.get(day) ?? 0,
      enrollments: enrollBy.get(day) ?? 0,
      students: studentsBy.get(day) ?? 0,
    };
  });

  return {
    kpis: { students, activeEnrollments, usedCodes, revenueToday: split([today]), revenueMonth: split(monthDays) },
    daily,
    studentsByGrade: byGrade.map((g) => ({ grade: g.grade, count: g._count._all })),
    latestEnrollments: latestEnrollments.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), expiresAt: e.expiresAt.toISOString() })),
    latestPayments: latestPayments.map(({ course, ...p }) => ({ ...p, createdAt: p.createdAt.toISOString(), courseTitle: course?.title ?? null })),
    generatedAt: now.toISOString(),
  };
}

export const getStats = (): Promise<AdminStatsDTO> => cached(STATS_CACHE_KEY, STATS_TTL_SEC, () => computeStats());
