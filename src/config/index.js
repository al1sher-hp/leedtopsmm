import 'dotenv/config';

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  telegram: {
    apiId: toInt(process.env.API_ID, 0),
    apiHash: process.env.API_HASH || '',
    session: process.env.SESSION || '',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    // 'gemini-3-flash-preview' ishlaydi, lekin "preview" modellar oldindan
    // ogohlantirishsiz o'chirilib qolishi mumkin (masalan gemini-2.0-flash
    // 2026-06-01'da to'xtatildi) — shuning uchun standart qiymat GA
    // (barqaror) modelga o'rnatilgan.
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  },
  db: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/leedtopsmm',
  },
  rateLimit: {
    maxRequestsPerHour: toInt(process.env.MAX_REQUESTS_PER_HOUR, 250),
    maxRequestsPerDay: toInt(process.env.MAX_REQUESTS_PER_DAY, 2000),
    requestDelayMs: toInt(process.env.REQUEST_DELAY_MS, 3000),
    requestDelayJitterMs: toInt(process.env.REQUEST_DELAY_JITTER_MS, 1500),
  },
  discovery: {
    depth: toInt(process.env.DISCOVERY_DEPTH, 2),
  },
  api: {
    port: toInt(process.env.PORT, 4000),
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  groupLeads: {
    // POST /api/group-leads/sync shu qiymat bilan himoyalangan (Vercel cron
    // so'rovi shuni yuboradi) — bo'sh bo'lsa endpoint hech qachon ishlamaydi
    // (login/API kalitsiz tashqi tomondan chaqirib yuborilmasligi uchun).
    cronSecret: process.env.CRON_SECRET || '',
  },
};

export default config;
