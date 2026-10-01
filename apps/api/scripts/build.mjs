// بناء الإنتاج: حزمة ESM واحدة للخادم وأخرى للـ seed.
// كودنا + @miss-ann/shared (مصدر TypeScript) يُدمجان في الحزمة؛ حزم npm تبقى خارجية وتُحمَّل من node_modules.
// (tsc وحده لا يكفي: shared يُستهلك كمصدر .ts ولا يعمل في Node مباشرة)
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@miss-ann/'));

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: { server: 'src/server.ts', seed: 'prisma/seed.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  // بعض الحزم الخارجية (CommonJS) تحتاج require داخل ESM
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
