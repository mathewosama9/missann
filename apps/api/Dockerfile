# syntax=docker/dockerfile:1
# صورة الـ API للإنتاج — البناء من جذر المستودع:  docker build -f apps/api/Dockerfile .
ARG NODE_VERSION=22

# ── الاعتماديات (طبقة تُعاد فقط عند تغيّر ملفات الحزم) ──
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @miss-ann/api...

# ── البناء: حزمة esbuild (server.js + seed.js) ثم نسخة إنتاج بلا devDependencies ──
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @miss-ann/api exec prisma generate \
 && pnpm --filter @miss-ann/api build \
 && pnpm --filter @miss-ann/api deploy --prod --legacy /out

# ── التشغيل ──
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# openssl لمحرك Prisma، و tini لتمرير إشارات الإيقاف (إغلاق نظيف للعمّال والطوابير)
# (إصدارات apt تتبع صورة bookworm نفسها؛ تثبيت أرقامها يكسر البناء مع كل تحديث أمني)
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
# PRIVATE_UPLOAD_DIR مسار مجلد لا سر (hadolint ينبّه لكلمة PRIVATE فقط)
# hadolint ignore=DL3064
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    PRIVATE_UPLOAD_DIR=/data/private-uploads
WORKDIR /app
# /out = package.json + dist (الحزمة) + prisma (schema + migrations) + node_modules الإنتاج فقط ("files" في package.json)
COPY --from=build /out ./
# عميل Prisma لهذه المنصة (linux/openssl-3) داخل node_modules الإنتاج
RUN npx prisma generate \
 && mkdir -p /data/uploads /data/private-uploads \
 && chown -R node:node /data
# الملفات الخاصة (حلول الواجبات) و الصور العامة على volumes — لا شيء منها داخل الصورة
VOLUME ["/data/uploads", "/data/private-uploads"]
# node = uid 1000 في صورة node الرسمية (رقمي لبيئات runAsNonRoot)
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
# الـ migrations قبل الإقلاع (آمنة للتكرار)، ثم الخادم كعملية رئيسية
CMD ["sh", "-c", "npx prisma migrate deploy && exec node --enable-source-maps dist/server.js"]
