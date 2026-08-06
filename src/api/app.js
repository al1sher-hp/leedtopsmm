import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from '../config/index.js';
import routes from './routes.js';
import blacklistRoutes from './blacklistRoutes.js';
import scanRoutes from './scanRoutes.js';
import outreachRoutes from './outreachRoutes.js';
import folderRoutes from './folderRoutes.js';
import dialogRoutes from './dialogRoutes.js';
import lookupRoutes from './lookupRoutes.js';
import groupLeadsRoutes from './groupLeadsRoutes.js';
import { startMonitor } from '../outreach/inboxMonitor.js';
import { purgeExpired } from '../lookup/cache.js';
import { checkHealth } from '../db/health.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.api.corsOrigin }));
// So'rov tanasi hajmini cheklash — ochiq (login talab qilmaydigan)
// endpoint'lar (masalan /api/blacklist) katta JSON yuborib xotira/CPU
// sarflashning oldini oladi.
app.use(express.json({ limit: '100kb' }));
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/outreach', outreachRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/dialogs', dialogRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api', groupLeadsRoutes);
app.use('/api', routes);

// Inbox monitorini server.js (doim ishlaydigan) ichida ishga tushirish —
// Vercel'da bu import zanjirida qoladi lekin `start()` chaqirilmaydi,
// shuning uchun setInterval real Vercel funksiyasida hech qachon tugamaydi.
export function startInboxMonitor() {
  startMonitor(5 * 60_000); // har 5 daqiqa
}

// HIMOYA #5 (raqamlar TTL bilan o'chadi) shu interval orqali amalga oshadi —
// muddati o'tgan PhoneLookup qatorlari va eskirgan raw_response'lar kunda
// bir marta tozalanadi. Xuddi inbox monitor kabi faqat doim ishlaydigan
// (server.js) entrypoint'da ishga tushiriladi.
const DAY_MS = 24 * 60 * 60 * 1000;
export function startLookupPurge() {
  purgeExpired()
    .then(({ expiredCount, rawCleared }) => {
      if (expiredCount > 0 || rawCleared > 0) {
        console.log(`[lookup] tozalash: ${expiredCount} ta muddati o'tgan yozuv, ${rawCleared} ta raw_response tozalandi`);
      }
    })
    .catch((err) => console.error('[lookup] tozalash xatosi:', err.message));
  setInterval(() => {
    purgeExpired().catch((err) => console.error('[lookup] tozalash xatosi:', err.message));
  }, DAY_MS);
}

// Faqat ulanishni emas, sxemani (kutilgan jadvallar mavjudligini) ham har
// so'rovda JONLI tekshiradi — shuning uchun Vercel serverless'da ham (u yerda
// server.js hech qachon ishga tushmaydi) to'g'ri natija beradi.
app.get('/health', async (req, res) => {
  const health = await checkHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

// Global xato handler — yuqoridagi route'lardan birortasida kutilmagan
// (try/catch qamrab olmagan) xato tashlansa ham, oqim (masalan CSV eksport)
// hali boshlanmagan bo'lsa toza JSON javob bilan yopiladi. Xatoning o'z
// status kodi bo'lsa (masalan body-parser'ning 413 "Payload Too Large"si)
// shuni hurmat qilamiz — barchasini 500'ga aylantirib yubormaymiz.
app.use((err, req, res, next) => {
  console.error('[api] qo\'lga olinmagan xato:', err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Server xatosi' : err.message });
});

export default app;
