import crypto from 'crypto';
import { BlacklistEntry } from '../db/models.js';

// Telegram username qoidalari: 5-32 belgi, harf bilan boshlanadi.
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

/**
 * Foydalanuvchi kiritgan @username yoki t.me havolasini toza username'ga
 * aylantiradi. Faqat ochiq (public username'li) obyektlar qo'llab-quvvatlanadi
 * — taklif havolalari (t.me/+...) resolve qilib bo'lmaydi, shuning uchun null.
 */
export function parseIdentifier(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  s = s.replace(/^(https?:\/\/)?(www\.)?t\.me\//i, '');
  s = s.replace(/^@/, '');
  s = s.replace(/[/?#].*$/, '');
  if (!USERNAME_RE.test(s)) return null;
  return s;
}

/** Tasdiqlash uchun tasodifiy, tavsifga qo'yish oson kod. */
export function generateVerificationCode() {
  return `TSMM-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export class BlacklistedError extends Error {
  constructor(targetId) {
    super(`Obyekt (${targetId}) qora ro'yxatda — ma'lumot yig'ish taqiqlangan`);
    this.name = 'BlacklistedError';
    this.isBlacklisted = true;
    this.targetId = targetId;
  }
}

// Har bir yig'ish so'rovida chaqirilgani uchun DB'ga bormasdan tez javob
// berish kerak — aktiv target_id'lar shu jarayon xotirasida keshlanadi.
const CACHE_TTL_MS = 60_000;
let cache = new Set();
let cacheLoadedAt = 0;
let loadingPromise = null;

async function loadCache() {
  const rows = await BlacklistEntry.findAll({
    where: { status: 'active' },
    attributes: ['target_id'],
    raw: true,
  });
  cache = new Set(rows.map((r) => r.target_id));
  cacheLoadedAt = Date.now();
}

async function ensureFreshCache() {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  if (!loadingPromise) {
    loadingPromise = loadCache().finally(() => {
      loadingPromise = null;
    });
  }
  await loadingPromise;
}

export async function isBlacklisted(targetId) {
  if (!targetId) return false;
  await ensureFreshCache();
  return cache.has(String(targetId));
}

// Ro'yxat o'zgarganda (tasdiqlash/olib tashlash) keshni darhol eskirgan deb
// belgilaydi — keyingi tekshiruv to'g'ridan-to'g'ri bazadan yangilanadi.
export function invalidateCache() {
  cacheLoadedAt = 0;
}

export default {
  parseIdentifier,
  generateVerificationCode,
  isBlacklisted,
  invalidateCache,
  BlacklistedError,
};
