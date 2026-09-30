import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_key_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_key_123456';
});

describe('progress clamp', () => {
  const now = Date.UTC(2026, 0, 1, 12);

  it('يرفض القفز إلى 100٪ في أول حفظ', async () => {
    const { clampReportedPercent } = await import('../src/modules/lessons/lessons.service.js');
    // حصة 10 دقائق: أول حفظ يقبل حتى 30 ثانية (5٪) فقط
    expect(clampReportedPercent(100, 0, 600, undefined, now)).toBeCloseTo(5);
  });

  it('يقبل المشاهدة الفعلية حتى سرعة 2x منذ آخر حفظ', async () => {
    const { clampReportedPercent } = await import('../src/modules/lessons/lessons.service.js');
    const last = new Date(now - 60_000); // دقيقة منذ آخر حفظ
    // 60s × 2 + 30s = 150s من 600s = 25٪ زيادة كحد أقصى
    expect(clampReportedPercent(30, 20, 600, last, now)).toBe(30);
    expect(clampReportedPercent(90, 20, 600, last, now)).toBeCloseTo(45);
  });

  it('لا يتدخل عند عدم معرفة المدة أو عند عدم الزيادة', async () => {
    const { clampReportedPercent } = await import('../src/modules/lessons/lessons.service.js');
    expect(clampReportedPercent(100, 0, 0, undefined, now)).toBe(100);
    expect(clampReportedPercent(10, 40, 600, undefined, now)).toBe(10);
  });
});
