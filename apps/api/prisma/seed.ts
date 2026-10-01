import type { Request } from 'express';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { createBatch } from '../src/modules/codes/codes.admin.service.js';

const isProd = process.env.NODE_ENV === 'production';
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';
const DEMO_BATCH_LABEL = 'دفعة تجريبية (seed)';

// الإنتاج: كلمة مرور الأدمن الأول من متغيرات البيئة (لا الافتراضية) — مطلوبة فقط عند إنشائه أول مرة،
// والبيانات التجريبية فقط مع SEED_DEMO=true
function adminPassword(): string {
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  if (isProd && (password === DEFAULT_ADMIN_PASSWORD || password.length < 10)) {
    throw new Error('في الإنتاج اضبط SEED_ADMIN_PASSWORD (10 أحرف على الأقل، غير الافتراضية)');
  }
  return password;
}

// أدمن + (في التطوير أو مع SEED_DEMO=true) طالب وكورسات وحصص ودفعة أكواد تجريبية — آمن للتكرار
async function main(): Promise<void> {
  // ── الأدمن (موجود ← لا يُلمس ولا تُطلب كلمة مرور) ─────────────
  const phone = process.env.SEED_ADMIN_PHONE ?? '01000000000';
  let admin = await prisma.user.findUnique({ where: { phone } });
  if (admin) {
    console.log(`• موجود: أدمن ${admin.phone}`);
  } else {
    const password = adminPassword();
    admin = await prisma.user.create({
      data: {
        name: 'مس آن بهاء',
        phone,
        parentPhone: phone,
        email: process.env.SEED_ADMIN_EMAIL ?? (isProd ? null : 'admin@missann.local'),
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
        isActive: true,
        governorate: 'القاهرة',
        wallet: { create: { balance: 0 } },
      },
    });
    console.log(`✔ أدمن: ${admin.phone}${isProd ? '' : ` / كلمة المرور: ${password}`}`);
  }

  if (isProd && process.env.SEED_DEMO !== 'true') {
    console.log('\n✅ اكتمل الـ seed (الإنتاج: أدمن فقط — SEED_DEMO=true لإضافة البيانات التجريبية)');
    return;
  }

  // ── طالب تجريبي ───────────────────────────────────────────────
  const studentPhone = '01111111111';
  await prisma.user.upsert({
    where: { phone: studentPhone },
    update: {},
    create: {
      name: 'طالب تجريبي',
      phone: studentPhone,
      parentPhone: '01222222222',
      passwordHash: await hashPassword('Student@123'),
      role: 'STUDENT',
      grade: 'FOURTH_PRIMARY',
      isActive: true,
      governorate: 'الجيزة',
      wallet: { create: { balance: 0 } },
    },
  });
  console.log(`✔ طالب: ${studentPhone} / كلمة المرور: Student@123`);

  // ── كورسات تجريبية ────────────────────────────────────────────
  const seedCourses = [
    {
      title: 'علوم رابعة ابتدائي — الترم الأول',
      description: 'كورس شامل لمنهج العلوم للصف الرابع الابتدائي — شرح مبسّط وممتع مع تجارب.',
      grade: 'FOURTH_PRIMARY' as const,
      type: 'MONTHLY' as const,
      term: 'FIRST' as const,
      price: 15000, // 150 ج.م
      lessons: [
        { title: 'مقدمة: إزاي نفكّر كعالم؟', durationSec: 600, isFreePreview: true },
        { title: 'الكائنات الحية وغير الحية', durationSec: 900, isFreePreview: false },
        { title: 'أجزاء النبات ووظائفها', durationSec: 840, isFreePreview: false },
      ],
    },
    {
      title: 'علوم خامسة ابتدائي — التأسيس',
      description: 'كورس تأسيسي يبني أساس قوي في العلوم لطلاب الصف الخامس الابتدائي.',
      grade: 'FIFTH_PRIMARY' as const,
      type: 'FOUNDATION' as const,
      term: null,
      price: 20000, // 200 ج.م
      lessons: [
        { title: 'المادة وحالاتها', durationSec: 720, isFreePreview: true },
        { title: 'الطاقة وأشكالها', durationSec: 780, isFreePreview: false },
      ],
    },
    {
      title: 'مراجعة نهائية — سادسة ابتدائي',
      description: 'مراجعة مركّزة على أهم أجزاء منهج العلوم للصف السادس قبل الامتحان.',
      grade: 'SIXTH_PRIMARY' as const,
      type: 'REVISION' as const,
      term: 'SECOND' as const,
      price: 0, // مجاني
      lessons: [
        { title: 'مراجعة الجهاز الدوري', durationSec: 900, isFreePreview: true },
        { title: 'مراجعة الكهرباء والمغناطيسية', durationSec: 960, isFreePreview: false },
      ],
    },
  ];

  for (const [i, c] of seedCourses.entries()) {
    const existing = await prisma.course.findFirst({ where: { title: c.title } });
    if (existing) {
      console.log(`• موجود: ${c.title}`);
      continue;
    }
    await prisma.course.create({
      data: {
        title: c.title,
        description: c.description,
        grade: c.grade,
        type: c.type,
        term: c.term,
        price: c.price,
        isPublished: true,
        order: i,
        lessons: {
          create: c.lessons.map((l, order) => ({
            title: l.title,
            order,
            durationSec: l.durationSec,
            isFreePreview: l.isFreePreview,
          })),
        },
      },
    });
    console.log(`✔ كورس: ${c.title} (${c.lessons.length} حصص)`);
  }

  // ── دفعة أكواد تجريبية (عبر نفس خدمة الأدمن: أكواد مجزّأة + سطر تدقيق) ─
  if (await prisma.codeBatch.findFirst({ where: { label: DEMO_BATCH_LABEL } })) {
    console.log(`• موجود: ${DEMO_BATCH_LABEL}`);
  } else {
    const asAdmin = { user: { sub: admin.id, role: admin.role }, ip: 'seed' } as unknown as Request;
    const { codes } = await createBatch(asAdmin, { label: DEMO_BATCH_LABEL, value: 5_000, count: 10 });
    // الأكواد الخام لا تُخزَّن — تظهر هنا مرة واحدة فقط
    console.log(`✔ ${DEMO_BATCH_LABEL}: 10 أكواد × 50 ج.م`);
    for (const c of codes) console.log(`   ${c}`);
  }

  console.log('\n✅ اكتمل الـ seed');
}

main()
  .catch((e) => {
    console.error('❌ فشل الـ seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
