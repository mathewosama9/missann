import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

// بيانات تجريبية للتطوير — أدمن + كورسات وحصص لكل صف
async function main(): Promise<void> {
  // ── أدمن افتراضي ──────────────────────────────────────────────
  const adminPhone = '01000000000';
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      name: 'مس آن بهاء',
      phone: adminPhone,
      parentPhone: adminPhone,
      email: 'admin@missann.local',
      passwordHash: await hashPassword('Admin@12345'),
      role: 'ADMIN',
      isActive: true,
      governorate: 'القاهرة',
      wallet: { create: { balance: 0 } },
    },
  });
  console.log(`✔ أدمن: ${admin.phone} / كلمة المرور: Admin@12345`);

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

  console.log('\n✅ اكتمل الـ seed');
}

main()
  .catch((e) => {
    console.error('❌ فشل الـ seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
