// جدول كل مسارات الـ API من المُجمِّع نفسه (لا قائمة يدوية تنسى مساراً جديداً) — لاختبارات RBAC الشاملة.
// كل عنصر: الطريقة، المسار الكامل بمعرّفات غير موجودة، والـ router المالك (لمعرفة حراسته).
import type { Router } from 'express';

export type RouteEntry = { method: string; path: string; owner: Router };

// معرّف صالح الصيغة غير موجود في القاعدة (≤ INT4) ← أي معالج يصل إليه يرد 404 ولا يلمس بيانات حقيقية
export const GHOST_ID = '2147483600';

type Layer = {
  route?: { path: string | RegExp; methods: Record<string, boolean> };
  name: string;
  handle: Router & { stack?: Layer[] };
  regexp: RegExp;
};

// مسار التركيب من regexp الخاص بـ Express 4 (مثل /^\/admin\/bunny\/?(?=\/|$)/i)
function mountPath(re: RegExp): string {
  if ((re as RegExp & { fast_slash?: boolean }).fast_slash) return '';
  return re.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');
}

const fill = (p: string) => p.replace(/:(\w+)(\([^)]*\))?\??/g, GHOST_ID);

export function routeTable(root: Router, base = '/api'): RouteEntry[] {
  const out: RouteEntry[] = [];
  const walk = (router: Router & { stack?: Layer[] }, prefix: string) => {
    for (const layer of (router.stack ?? []) as Layer[]) {
      if (layer.route && typeof layer.route.path === 'string') {
        for (const m of Object.keys(layer.route.methods)) {
          out.push({ method: m.toUpperCase(), path: fill(prefix + layer.route.path), owner: router });
        }
      } else if (layer.name === 'router') {
        walk(layer.handle, prefix + mountPath(layer.regexp));
      }
    }
  };
  walk(root as Router & { stack?: Layer[] }, base);
  return out;
}
