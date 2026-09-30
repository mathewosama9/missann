# منصة مس آن بهاء — تعليم العلوم للمرحلة الابتدائية

منصة دروس علوم أونلاين (React + Node.js) لطلاب الصف الرابع والخامس والسادس الابتدائي، بلوحة تحكم
للطالب ولوحة تحكم للأدمن.

## المكوّنات
- `apps/web` — واجهة React + Vite + TypeScript + TailwindCSS (RTL).
- `apps/api` — Express + TypeScript + Prisma (PostgreSQL) + Redis/BullMQ.
- `packages/shared` — أنواع وZod schemas مشتركة.

## التشغيل محلياً
```bash
# 1) شغّل قاعدة البيانات وRedis
docker compose up -d

# 2) ثبّت الاعتماديات
pnpm install

# 3) جهّز قاعدة البيانات
cp apps/api/.env.example apps/api/.env   # عدّل الأسرار
pnpm --filter @miss-ann/api prisma:migrate
pnpm --filter @miss-ann/api seed

# 4) شغّل التطوير (api على :3000 و web على :5173)
pnpm dev
```

## الأوامر
- `pnpm dev` — تشغيل الواجهة والـ API معاً.
- `pnpm build` — بناء الكل.
- `pnpm typecheck` / `pnpm lint` / `pnpm test`.

## التكاملات المطلوبة (مفاتيح في `.env`)
- **Bunny.net Stream** — استضافة وحماية الفيديو.
- **Paymob** — الدفع الأونلاين.
- **WhatsApp Cloud API / SMS** — الإشعارات وإشعار ولي الأمر.
