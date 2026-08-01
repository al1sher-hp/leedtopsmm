import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lokal devda /api/* va /health so'rovlarini Express serverga proksi
    // qiladi — shu tufayli hech qanday .env yoki VITE_API_URL sozlamasi
    // shart emas. /health alohida qo'shilgan — u /api ostida emas
    // (src/api/app.js'da app.get('/health', ...) ildizga bog'langan).
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
