import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Кабинет платформы живёт на business-safe.ru/office/ (путь, не поддомен
  // — см. комментарий в frontend/vite.config.js и deploy/nginx.conf).
  base: '/office/',
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
