// Guruh lead'lar moduli faqat Telegram'ning OCHIQ (obuna/login talab
// qilmaydigan) web-preview sahifalarini o'qiydi — t.me/s/<username> (kanal
// postlari) va t.me/<username>/<id>?embed=1&discussion=1 (izohlar). Hech
// qanday MTProto/userbot ulanishi (session/api_id/api_hash) ishlatilmaydi —
// oddiy HTTP GET, xuddi qidiruv tizimi botining o'qishi kabi.

// O'zini aniq tanishtiruvchi User-Agent — Telegram serveriga "odob" (kim
// so'rov yuborayotgani ochiq bo'lishi kerak).
const USER_AGENT = 'TopSMM-GroupLeadsCollector/1.0 (+https://topsmm.uz; ochiq t.me/s va embed sahifalarini o\'qiydi)';

const MAX_RETRIES = 3;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff: 1s, 2s, 4s... 30s'gacha cap + kichik jitter. */
export function backoffDelayMs(attempt) {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
}

/**
 * So'rovlar orasida Telegram serveriga "odob" kutish — 1.5-2 soniya oralig'ida.
 */
export function politeDelayMs() {
  return 1500 + Math.random() * 500;
}

/**
 * Bitta ochiq Telegram sahifasini (t.me/s/... yoki t.me/.../?embed=1...) HTML
 * matni sifatida yuklaydi. HTTP 429/5xx da eksponensial backoff bilan
 * qayta urinadi (jami ko'pi bilan MAX_RETRIES marta). Boshqa status
 * kodlarni (masalan 404 — "not found" sahifasi) xato deb hisoblamaydi,
 * chaqiruvchiga xom holda qaytaradi — chaqiruvchi buni oddiy holat sifatida
 * (masalan "izohlar yopiq") qayta ishlaydi.
 */
export async function fetchTelegramHtml(url) {
  let attempt = 0;
  while (true) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw new Error(`[group-leads] ${url} so'roviga ulanib bo'lmadi: ${err.message}`);
      await sleep(backoffDelayMs(attempt));
      attempt += 1;
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(`[group-leads] ${url}: Telegram HTTP ${res.status} (${MAX_RETRIES} urinishdan keyin)`);
      }
      await sleep(backoffDelayMs(attempt));
      attempt += 1;
      continue;
    }

    const html = await res.text();
    return { status: res.status, html };
  }
}

export default { fetchTelegramHtml, sleep, backoffDelayMs, politeDelayMs };
