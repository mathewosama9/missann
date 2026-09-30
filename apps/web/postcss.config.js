import { fileURLToPath } from 'node:url';

export default {
  plugins: {
    // مسار صريح حتى لا يعتمد على مجلد التشغيل
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
