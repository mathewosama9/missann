# منصة مس آن بهاء — تعليم العلوم للمرحلة الابتدائية

منصة دروس علوم أونلاين لطلاب الصف الرابع والخامس والسادس الابتدائي: موقع عام وكتالوج كورسات، لوحة للطالب
(كورساتي، المحفظة وكروت الشحن، الامتحانات، الواجبات، الحصص اللايف، الإشعارات)، ولوحة للأدمن والمساعدين
(الكورسات والحصص، الأكواد، المدفوعات، الامتحانات والتصحيح، الإشعارات الجماعية، الطلاب، الإعدادات وسجل العمليات).

## المكوّنات

| المجلد | المحتوى |
| --- | --- |
| `apps/web` | الواجهة: React 18 + Vite 6 + TypeScript + Tailwind (RTL)، React Router 7، React Query |
| `apps/api` | الخادم: Express + TypeScript + Prisma (PostgreSQL 16) + Redis/BullMQ (طوابير الرسائل والمهام) |
| `packages/shared` | أنواع و Zod schemas وثوابت مشتركة بين الواجهة والخادم (تُستهلك كمصدر TypeScript) |
| `deploy/` | إعدادات الإنتاج: nginx، Caddy (HTTPS)، ومثال متغيرات البيئة |
| `docs/RUNBOOK.md` | دليل التشغيل على السيرفر: أول نشر، التحديث، النسخ الاحتياطي، المتابعة، الأعطال |

## التشغيل محلياً

المتطلبات: Node 22+، pnpm 10، PostgreSQL 16، Redis 6.2+ (BullMQ).

```bash
# 1) قاعدة البيانات و Redis (أو شغّلهما بدون Docker — أي Postgres 16 و Redis ≥ 6.2)
docker compose up -d

# 2) الاعتماديات
pnpm install

# 3) الإعدادات والقاعدة
cp apps/api/.env.example apps/api/.env      # عدّل الأسرار
pnpm --filter @miss-ann/api prisma:deploy   # كل الـ migrations
pnpm --filter @miss-ann/api seed            # أدمن + طالب + 3 كورسات + دفعة 10 أكواد تجريبية

# 4) التطوير: الواجهة على :5173 والـ API على :3000 (الواجهة تمرّر /api للـ API)
pnpm dev
```

حسابات الـ seed للتطوير فقط: الأدمن `01000000000` / `Admin@12345`، والطالب `01111111111` / `Student@123`.
أكواد الدفعة التجريبية تظهر مرة واحدة في مخرجات أمر الـ seed (القاعدة تحفظها مجزّأة فقط).

## الأوامر

| الأمر | الوظيفة |
| --- | --- |
| `pnpm dev` | الواجهة والـ API معاً مع إعادة التحميل |
| `pnpm -r lint` | ESLint 9 لكل الحزم (`eslint.config.mjs`) |
| `pnpm -r typecheck` | فحص الأنواع |
| `pnpm --filter @miss-ann/api test` | اختبارات الـ API (Vitest + Supertest على Postgres و Redis حقيقيين) |
| `pnpm --filter @miss-ann/api build` | حزمة الإنتاج `dist/server.js` و `dist/seed.js` (esbuild) |
| `pnpm --filter @miss-ann/web build` | ملفات الواجهة في `apps/web/dist` |
| `pnpm audit` | فحص ثغرات الاعتماديات |

### الاختبارات
- تحتاج Postgres و Redis شغّالين (نفس `DATABASE_URL` في `apps/api/.env`). كل ملف اختبار ينشئ بياناته المؤقتة
  بأرقام موبايل خاصة به ويحذفها في النهاية، ويعزل طوابيره في قاعدة Redis مستقلة (1–3) عن خادم التطوير (0).
- `tests/security.integration.test.ts` يمسح **كل** مسارات الـ API تلقائياً (من جدول المسارات نفسه): أي مسار جديد
  بلا حماية أو بصلاحية خاطئة يُسقط الاختبار.
- CI على GitHub (`.github/workflows/ci.yml`): lint + typecheck + بناء + اختبارات على Postgres/Redis حقيقيين +
  بناء صور Docker وتجربة تشغيل صورة الـ API.

## متغيرات البيئة
- التطوير: `apps/api/.env.example` (كل متغير موثّق بجانبه).
- الإنتاج: `deploy/.env.example` — الخادم **يرفض الإقلاع** في الإنتاج بأسرار JWT ضعيفة أو متطابقة أو بـ `APP_URL` بلا https.
- ملفات `.env` سرّية ولا تُرفع على GitHub (مستثناة في `.gitignore` و `.dockerignore`).

## النشر (الإنتاج)
سيرفر Linux واحد (VPS) عليه Docker:

```bash
cp deploy/.env.example deploy/.env    # املأ الدومين والأسرار
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f docker-compose.prod.yml --env-file deploy/.env exec api node dist/seed.js   # أول أدمن
```

التفاصيل الكاملة (الدومين، HTTPS، النسخ الاحتياطي، التحديث، المتابعة، الأعطال) في [docs/RUNBOOK.md](docs/RUNBOOK.md).

## التكاملات (مفاتيح في ملف البيئة)
- **Bunny.net Stream / Storage** — استضافة الفيديو بروابط موقّعة + علامة مائية (بدونها: فيديوهات يوتيوب غير مدرجة).
- **Paymob** — الدفع الأونلاين بتحقق HMAC (بدونها: الشحن بكروت الأكواد فقط).
- **WhatsApp Cloud API / SMS** — كود التحقق، نتيجة الامتحان لولي الأمر، التذكيرات (بدونها في التطوير: تُكتب في السجل فقط).

## الأمان باختصار
argon2 لكلمات المرور؛ توكن وصول 15 دقيقة + توكن تحديث مُدوَّر في كوكي httpOnly مع كشف إعادة الاستخدام؛ إنهاء
الجلسات يسري فوراً (تغيير كلمة المرور/إزالة جهاز/تعطيل)؛ RBAC على كل مسار + فحص الملكية؛ Zod على كل المدخلات؛
Helmet + CSP (nginx) + CORS + فحص المصدر لمسارات الكوكي + حدود طلبات؛ عمليات المال ذرّية بأقفال؛ الأكواد وأكواد
التحقق مجزّأة؛ لا أسرار في السجلات؛ سجل تدقيق لكل عمليات الأدمن داخل نفس المعاملة.
