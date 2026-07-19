import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lokal devda /api/* so'rovlarini Express serverga proksi qiladi — shu
    // tufayli hech qanday .env yoki VITE_API_URL sozlamasi shart emas.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
