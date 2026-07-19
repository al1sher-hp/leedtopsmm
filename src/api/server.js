import app from './app.js';
import config from '../config/index.js';
import sequelize from '../db/index.js';

// Doim ishlaydigan (persistent) entrypoint — Docker/Railway/Render/lokal uchun.
// Vercel serverless funksiyasi buni ishlatmaydi, o'rniga app.js'ni to'g'ridan-to'g'ri
// eksport qiladi (qarang: api/[...all].js).
async function start() {
  try {
    await sequelize.authenticate();
    console.log('[api] DB ulanishi OK');
  } catch (err) {
    console.error('[api] DB ulanish xatosi:', err.message);
  }

  app.listen(config.api.port, () => {
    console.log(`[api] server ishga tushdi: http://localhost:${config.api.port}`);
  });
}

start();
