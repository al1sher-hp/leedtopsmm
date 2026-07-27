import app, { startInboxMonitor } from './app.js';
import config from '../config/index.js';
import sequelize from '../db/index.js';
import { closeStalePipelineRuns } from '../db/staleRuns.js';

// Doim ishlaydigan (persistent) entrypoint — Docker/Railway/Render/lokal uchun.
// Vercel serverless funksiyasi buni ishlatmaydi, o'rniga app.js'ni to'g'ridan-to'g'ri
// eksport qiladi (qarang: api/[...all].js).
async function start() {
  try {
    await sequelize.authenticate();
    console.log('[api] DB ulanishi OK');
    await closeStalePipelineRuns().catch((err) => console.error('[api] osilib qolgan run tozalash xatosi:', err.message));
    startInboxMonitor();
  } catch (err) {
    console.error('[api] DB ulanish xatosi:', err.message);
  }

  // DB ulanmagan bo'lsa ham server ishga tushadi (masalan health-check yoki
  // keyinroq DB tiklanishini kutish uchun) — /health har chaqiriqda o'zi
  // qayta ulanishni sinab ko'radi (qarang: app.js).
  app.listen(config.api.port, () => {
    console.log(`[api] server ishga tushdi: http://localhost:${config.api.port}`);
  });
}

start();
