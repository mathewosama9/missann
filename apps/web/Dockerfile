# syntax=docker/dockerfile:1
# الواجهة للإنتاج: بناء Vite ثم nginx يقدّم الملفات ويمرّر /api للـ API
# البناء من جذر المستودع:  docker build -f apps/web/Dockerfile .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @miss-ann/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @miss-ann/web build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD ["wget", "-qO-", "http://127.0.0.1/healthz"]
