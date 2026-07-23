import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from '../config/index.js';
import routes from './routes.js';
import blacklistRoutes from './blacklistRoutes.js';
import scanRoutes from './scanRoutes.js';
import outreachRoutes from './outreachRoutes.js';
import { startMonitor } from '../outreach/inboxMonitor.js';

const app = express();

// So'nggi ma'lum DB ulanish holati — server.js (persistent entrypoint)
// DB authenticate() natijasiga qarab shuni yangilaydi, /health shuni aks
// ettiradi. Eslatma: Vercel serverless'da (api/index.js) bu hech qachon
// chaqirilmaydi — har so'rov mustaqil bo'lgani uchun bu flag u yerda
// ma'noli emas, faqat doim ishlaydigan (server.js) entrypoint uchun.
let dbOk = false;
export function setDbStatus(ok) {
  dbOk = ok;
}

app.use(helmet());
app.use(cors({ origin: config.api.corsOrigin }));
// So'rov tanasi hajmini cheklash — ochiq (login talab qilmaydigan)
// endpoint'lar (masalan /api/blacklist) katta JSON yuborib xotira/CPU
// sarflashning oldini oladi.
app.use(express.json({ limit: '100kb' }));
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/outreach', outreachRoutes);
app.use('/api', routes);

// Inbox monitorini server.js (doim ishlaydigan) ichida ishga tushirish —
// Vercel'da bu import zanjirida qoladi lekin `start()` chaqirilmaydi,
// shuning uchun setInterval real Vercel funksiyasida hech qachon tugamaydi.
// Persistent server uchun: server.js'dan setDbStatus(true) chaqirilgach monitor ham boshlanadi.
export function startInboxMonitor() {
  startMonitor(5 * 60_000); // har 5 daqiqa
}
app.get('/health', (req, res) => res.json({ ok: dbOk, db: dbOk }));

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
