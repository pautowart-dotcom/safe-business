import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
