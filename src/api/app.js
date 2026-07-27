import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from '../config/index.js';
import sequelize from '../db/index.js';
import { checkRequiredTables } from '../db/health.js';
import routes from './routes.js';
import blacklistRoutes from './blacklistRoutes.js';
import scanRoutes from './scanRoutes.js';
import outreachRoutes from './outreachRoutes.js';
import groupLeadsRoutes from './groupLeadsRoutes.js';
import { startMonitor } from '../outreach/inboxMonitor.js';

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
app.use('/api', groupLeadsRoutes);
app.use('/api', routes);

// Inbox monitorini server.js (doim ishlaydigan) ichida ishga tushirish —
// Vercel'da bu import zanjirida qoladi lekin `start()` chaqirilmaydi,
// shuning uchun setInterval real Vercel funksiyasida hech qachon tugamaydi.
export function startInboxMonitor() {
  startMonitor(5 * 60_000); // har 5 daqiqa
}

// Har chaqiriqda haqiqiy tekshiruv (oldingi versiya faqat server.js
// (doim ishlaydigan entrypoint) yangilagan keshlangan bayroqni qaytarardi
// — Vercel serverless'da (api/index.js) bu hech qachon yangilanmagani
// uchun /health u yerda doim `ok:false` qaytarardi, DB holatidan qat'i
// nazar). `missing` — "relation ... does not exist" xatosining aynan
// qaysi jadval(lar) yo'qligidan kelib chiqayotganini ko'rsatadi (masalan
// `npm run migrate` boshqa DATABASE_URL'ga qarshi ishga tushirilgan bo'lsa).
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    const tables = await checkRequiredTables();
    res.status(tables.ok ? 200 : 500).json({ ok: tables.ok, db: true, ...tables });
  } catch (err) {
    res.status(500).json({ ok: false, db: false, error: err.message });
  }
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
