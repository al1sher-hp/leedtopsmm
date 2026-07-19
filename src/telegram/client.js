import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from '../config/index.js';
import { pipelineCancellation } from '../jobs/cancellation.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Uzoq kutishlarni (ba'zan 1-3 daqiqagacha) 1 soniyalik bo'laklarga bo'lib
// kutadi va har bo'lakdan keyin bekor qilinganini tekshiradi — shu tufayli
// "to'xtatish" bosilgach, o'rtacha 1 soniya ichida haqiqatan to'xtaydi.
async function cancellableSleep(ms) {
  const CHUNK_MS = 1000;
  let remaining = ms;
  while (remaining > 0) {
    pipelineCancellation.throwIfCancelled();
    const wait = Math.min(CHUNK_MS, remaining);
    await sleep(wait);
    remaining -= wait;
  }
  pipelineCancellation.throwIfCancelled();
}

function isFloodWaitError(err) {
  return (
    err?.className === 'FloodWaitError' ||
    err?.errorMessage === 'FLOOD' ||
    /FLOOD_WAIT/.test(err?.message || '')
  );
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Odam xatti-harakatiga o'xshash kutish vaqti: bir xil (tekis taqsimlangan)
// oraliq o'zi ham "bot" belgisi bo'lishi mumkin — haqiqiy odam ko'pincha tez
// harakat qiladi, ba'zida o'ylanib to'xtaydi, kamdan-kam chalg'iydi. Uch
// qatlamli model shuni taqlid qiladi:
//   ~2%  — "chalg'ish" tanaffusi (1-3 daqiqa)
//   ~10% — "o'ylanish" pauzasi (8-25 soniya)
//   ~88% — oddiy kutish (REQUEST_DELAY_MS + qiya taqsimlangan jitter —
//          ikkita tasodifiy son ko'paytmasi kichik qiymatlarga og'irlik
//          beradi, shuning uchun ko'pchilik so'rov tez, ozchiligi sekinroq)
const HUMAN_BREAK_CHANCE = 0.02;
const HUMAN_BREAK_RANGE_MS = [60_000, 180_000];
const HUMAN_PAUSE_CHANCE = 0.1;
const HUMAN_PAUSE_RANGE_MS = [8_000, 25_000];

function humanDelayMs() {
  const roll = Math.random();
  if (roll < HUMAN_BREAK_CHANCE) {
    return randomBetween(...HUMAN_BREAK_RANGE_MS);
  }
  if (roll < HUMAN_BREAK_CHANCE + HUMAN_PAUSE_CHANCE) {
    return randomBetween(...HUMAN_PAUSE_RANGE_MS);
  }
  const baseDelay = config.rateLimit.requestDelayMs;
  const skewedJitter = Math.random() * Math.random() * config.rateLimit.requestDelayJitterMs;
  return baseDelay + skewedJitter;
}

// Har bir sessiya o'zining soatlik so'rov byudjeti va delay'ini boshqaradi.
// Bir nechta userbot akkaunt qo'shish uchun SessionPool'ga yangi StringSession qo'shish kifoya.
class RateLimitedSession {
  constructor(client, label) {
    this.client = client;
    this.label = label;
    this.requestsThisHour = 0;
    this.hourWindowStart = Date.now();
  }

  _resetWindowIfNeeded() {
    const now = Date.now();
    if (now - this.hourWindowStart >= 3600_000) {
      this.hourWindowStart = now;
      this.requestsThisHour = 0;
    }
  }

  async _waitForBudget() {
    this._resetWindowIfNeeded();
    while (this.requestsThisHour >= config.rateLimit.maxRequestsPerHour) {
      pipelineCancellation.throwIfCancelled();
      const now = Date.now();
      const msLeft = this.hourWindowStart + 3600_000 - now;
      const waitMs = Math.max(msLeft, 1000);
      console.log(
        `[rate-limit:${this.label}] soatlik limit (${config.rateLimit.maxRequestsPerHour}) tugadi, ${Math.ceil(
          waitMs / 1000
        )}s kutilmoqda...`
      );
      await cancellableSleep(Math.min(waitMs, 60_000));
      this._resetWindowIfNeeded();
    }
  }

  // Barcha MTProto so'rovlari shu orqali o'tishi SHART — rate-limit va
  // FloodWait himoyasi markazlashgan.
  async invoke(request, { retries = 5 } = {}) {
    pipelineCancellation.throwIfCancelled();
    await this._waitForBudget();

    const delay = humanDelayMs();
    if (delay >= HUMAN_PAUSE_RANGE_MS[0]) {
      console.log(`[timing:${this.label}] ${Math.round(delay / 1000)}s kutilmoqda (odam-o'xshash tanaffus)...`);
    }
    await cancellableSleep(delay);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.requestsThisHour += 1;
        return await this.client.invoke(request);
      } catch (err) {
        if (isFloodWaitError(err)) {
          const waitSeconds = err.seconds || 30;
          console.warn(`[flood-wait:${this.label}] ${waitSeconds}s kutish talab qilindi, kutilmoqda...`);
          await cancellableSleep((waitSeconds + 1) * 1000);
          continue;
        }
        if (attempt < retries) {
          console.warn(
            `[retry:${this.label}] so'rov xatosi: ${err.message}. Qayta urinish ${attempt + 1}/${retries}`
          );
          await cancellableSleep(2000 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[${this.label}] so'rov muvaffaqiyatsiz (retries tugadi)`);
  }
}

class SessionPool {
  constructor() {
    this.sessions = [];
    this.cursor = 0;
  }

  async init(sessionStrings) {
    for (let i = 0; i < sessionStrings.length; i++) {
      const sessionStr = sessionStrings[i];
      if (!sessionStr) continue;
      const client = new TelegramClient(
        new StringSession(sessionStr),
        config.telegram.apiId,
        config.telegram.apiHash,
        { connectionRetries: 5 }
      );
      await client.connect();
      this.sessions.push(new RateLimitedSession(client, `session-${i + 1}`));
    }
    if (this.sessions.length === 0) {
      throw new Error("Hech qanday SESSION topilmadi. Avval 'npm run login' ishga tushiring.");
    }
    return this;
  }

  // Navbat bilan sessiyalarni almashtirib boradi (round-robin) — bir nechta
  // akkaunt bo'lganda yukni taqsimlash uchun.
  next() {
    const s = this.sessions[this.cursor % this.sessions.length];
    this.cursor += 1;
    return s;
  }

  async invoke(request, opts) {
    return this.next().invoke(request, opts);
  }

  get primary() {
    return this.sessions[0];
  }

  get primaryClient() {
    return this.sessions[0].client;
  }

  async disconnectAll() {
    for (const s of this.sessions) {
      await s.client.disconnect();
    }
  }
}

let poolInstance = null;

// SESSION env ichida bir nechta sessiya vergul bilan ajratilishi mumkin
// (masalan "session1,session2") — kelajakda ko'p akkauntga o'tish uchun.
export async function getPool() {
  if (poolInstance) return poolInstance;
  const sessionStrings = config.telegram.session
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  poolInstance = new SessionPool();
  await poolInstance.init(sessionStrings);
  return poolInstance;
}

export async function disconnectPool() {
  if (poolInstance) {
    await poolInstance.disconnectAll();
    poolInstance = null;
  }
}

export { SessionPool, RateLimitedSession, sleep, isFloodWaitError };
export default { getPool, disconnectPool };
