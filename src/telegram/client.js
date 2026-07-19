import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from '../config/index.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFloodWaitError(err) {
  return (
    err?.className === 'FloodWaitError' ||
    err?.errorMessage === 'FLOOD' ||
    /FLOOD_WAIT/.test(err?.message || '')
  );
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
      const now = Date.now();
      const msLeft = this.hourWindowStart + 3600_000 - now;
      const waitMs = Math.max(msLeft, 1000);
      console.log(
        `[rate-limit:${this.label}] soatlik limit (${config.rateLimit.maxRequestsPerHour}) tugadi, ${Math.ceil(
          waitMs / 1000
        )}s kutilmoqda...`
      );
      await sleep(Math.min(waitMs, 60_000));
      this._resetWindowIfNeeded();
    }
  }

  // Barcha MTProto so'rovlari shu orqali o'tishi SHART — rate-limit va
  // FloodWait himoyasi markazlashgan.
  async invoke(request, { retries = 5 } = {}) {
    await this._waitForBudget();

    const baseDelay = config.rateLimit.requestDelayMs;
    const jitter = Math.floor(Math.random() * config.rateLimit.requestDelayJitterMs);
    await sleep(baseDelay + jitter);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.requestsThisHour += 1;
        return await this.client.invoke(request);
      } catch (err) {
        if (isFloodWaitError(err)) {
          const waitSeconds = err.seconds || 30;
          console.warn(`[flood-wait:${this.label}] ${waitSeconds}s kutish talab qilindi, kutilmoqda...`);
          await sleep((waitSeconds + 1) * 1000);
          continue;
        }
        if (attempt < retries) {
          console.warn(
            `[retry:${this.label}] so'rov xatosi: ${err.message}. Qayta urinish ${attempt + 1}/${retries}`
          );
          await sleep(2000 * (attempt + 1));
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
