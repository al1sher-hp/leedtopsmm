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
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  },
  db: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/leedtopsmm',
  },
  rateLimit: {
    maxRequestsPerHour: toInt(process.env.MAX_REQUESTS_PER_HOUR, 250),
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
};

export default config;
