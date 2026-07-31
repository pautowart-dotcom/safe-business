import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
