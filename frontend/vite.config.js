import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Один ID на всю сборку — используется и в самом бандле (через define), и в
// отдельном version.json рядом с ним. Клиент сверяет их между собой, чтобы
// понять, что вышла новая версия, и обновиться сам — без этого standalone/PWA
// на iOS может годами показывать старый JS, не перечитывая index.html
// (см. utils/versionCheck.js).
const buildId = String(Date.now());

function writeVersionFile() {
  return {
    name: 'write-version-file',
    apply: 'build',
    closeBundle() {
      writeFileSync(resolve(process.cwd(), 'dist/version.json'), JSON.stringify({ buildId }));
    },
  };
}

export default defineConfig({
  plugins: [react(), writeVersionFile()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  // Приложение живёт на business-safe.ru/lk/ (путь, не поддомен —
  // провайдеры РФ блокировали lk.business-safe.ru по SNI, см.
  // deploy/nginx.conf). base переписывает все root-relative пути в
  // index.html при сборке под этот префикс.
  base: '/lk/',
  build: {
    // Временно, для расследования краша "n is not a function" — без этого
    // лог ошибок (client_error_reports) хранит только минифицированные имена
    // переменных, по которым нельзя понять, что реально сломалось.
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
