// وحدات الإشعارات بلا قاعدة ولا Redis: عرض القوالب الآمن، فحص المتغيّرات، تنقية أخطاء المزوّد،
// وسجل مزوّد التطوير (رقم مُقنَّع، كود التحقق محجوب).
import { describe, it, expect, vi } from 'vitest';
import {
  broadcastSchema,
  renderTemplate,
  SYSTEM_TEMPLATES,
  templateContentSchema,
  templateCreateSchema,
  templateVarErrors,
} from '@miss-ann/shared';

process.env.WHATSAPP_TOKEN = 'unit-secret-wa-token';
process.env.SMS_API_KEY = 'unit-secret-sms-key';
const { safeError, toIntl, devLogProvider } = await import('../src/lib/messaging.js');
const { logger } = await import('../src/lib/logger.js');

describe('renderTemplate', () => {
  it('يستبدل المتغيّرات المعروفة فقط، في تمريرة واحدة، بلا تقييم ولا حقن', () => {
    const tpl = SYSTEM_TEMPLATES.parent_exam_result.defaults.WHATSAPP.body;
    expect(renderTemplate(tpl, { name: 'سارة', score: 8, total: 10, exam: 'الوحدة الأولى' })).toBe(
      'ابنك/بنتك سارة حصل على 8/10 في امتحان الوحدة الأولى',
    );
    // قيمة تحتوي متغيّراً آخر لا يُعاد استبدالها، وكود JS/HTML يبقى نصاً حرفياً
    expect(renderTemplate('{name} — {code}', { name: '{code}<script>alert(1)</script>${process.env}' })).toBe(
      '{code}<script>alert(1)</script>${process.env} — {code}',
    );
    // أحرف التحكم (أسطر جديدة) تُسطَّح والقيمة تُقص
    expect(renderTemplate('[{name}]', { name: 'أ\nب\r\n' + 'x'.repeat(300) })).toMatch(/^\[أ ب x+\]$/);
    expect(renderTemplate('[{name}]', { name: 'x'.repeat(300) })).toHaveLength(122);
    // خصائص النموذج الأولي ليست متغيّرات
    expect(renderTemplate('{constructor}{__proto__}', {})).toBe('{constructor}{__proto__}');
  });
});

describe('template placeholders', () => {
  const vars = ['name', 'score'];
  it('يرفض متغيّراً غير مسموح ومتغيّراً إلزامياً ناقصاً — كلٌّ على حدة', () => {
    expect(templateVarErrors(vars, ['score'], { title: '', body: '{name} {score}' })).toEqual({});
    expect(Object.keys(templateVarErrors(vars, ['score'], { title: '{phone}', body: '{score}' }))).toEqual(['title']);
    expect(Object.keys(templateVarErrors(vars, ['score'], { title: '', body: '{name}' }))).toEqual(['body']);
  });

  it('مخطط التعديل يُطبّق قائمة المفتاح وقنواته', () => {
    const ok = { title: 'نتيجة', body: 'ابنك/بنتك {name} حصل على {score}/{total} في امتحان {exam}' };
    expect(templateContentSchema('parent_exam_result', 'WHATSAPP').safeParse(ok).success).toBe(true);
    // نفس النص الصالح على قناة لا يدعمها المفتاح
    const ch = templateContentSchema('parent_exam_result', 'IN_APP').safeParse(ok);
    expect(ch.success || ch.error.issues.map((i) => i.path[0])).toEqual(['channel']);
    // كود التحقق إلزامي في قالب otp
    const otp = templateContentSchema('otp', 'WHATSAPP').safeParse({ body: 'كودك جاهز' });
    expect(otp.success || otp.error.issues.map((i) => i.path[0])).toEqual(['body']);
  });

  it('القالب المخصّص: مفتاح slug غير محجوز، والمسموح {name} فقط', () => {
    const base = { key: 'welcome_msg', channel: 'IN_APP', title: 'أهلاً {name}', body: 'مرحباً بك' };
    expect(templateCreateSchema.safeParse(base).success).toBe(true);
    const paths = (v: object) => {
      const r = templateCreateSchema.safeParse(v);
      return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    };
    expect(paths({ ...base, key: 'otp' })).toEqual(['key']);
    expect(paths({ ...base, key: 'Bad-Key' })).toEqual(['key']);
    expect(paths({ ...base, channel: 'SMS' })).toEqual(['channel']);
    expect(paths({ ...base, body: 'كودك {code}' })).toEqual(['body']);
    expect(paths({ ...base, extra: 1 })).toEqual(['']);
  });

  it('الإرسال الجماعي: {name} فقط', () => {
    const base = { title: 'تنبيه', body: 'أهلاً {name}', audience: 'ALL' };
    expect(broadcastSchema.safeParse(base).success).toBe(true);
    const r = broadcastSchema.safeParse({ ...base, body: 'رقمك {phone}' });
    expect(r.success || r.error.issues.map((i) => i.path[0])).toEqual(['body']);
  });
});

describe('provider hygiene', () => {
  it('toIntl: 01xxxxxxxxx ← 201xxxxxxxxx', () => {
    expect(toIntl('01012345678')).toBe('201012345678');
  });

  it('safeError يحجب مفاتيح المزوّد والأرقام الكاملة ويقص الطول', () => {
    const out = safeError(`bad token unit-secret-wa-token key unit-secret-sms-key for 201012345678 ${'x'.repeat(500)}`);
    expect(out).not.toContain('unit-secret');
    expect(out).not.toContain('201012345678');
    expect(out).toContain('201*****678');
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('مزوّد التطوير: الرقم مُقنَّع، والنص الحسّاس محجوب، والعادي يظهر', async () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await devLogProvider.send('01012345678', 'كود التحقق: 482913', { sensitive: true });
    await devLogProvider.send('01012345678', 'ابنك/بنتك سارة حصل على 8/10', { sensitive: false });
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).not.toContain('482913');
    expect(logged).not.toContain('01012345678');
    expect(logged).toContain('010*****678');
    expect(logged).toContain('حصل على 8/10');
  });
});
