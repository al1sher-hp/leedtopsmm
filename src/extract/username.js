// Telegram username qoidalari: 5-32 belgi, harf bilan boshlanadi,
// harf/raqam/pastki chiziqdan iborat.
const USERNAME_RE = /@([a-zA-Z][a-zA-Z0-9_]{4,31})/g;

// Kontakt/reklama uchun ishlatiladigan kalit so'zlar — shu so'zlarga yaqin
// joylashgan username'lar "aloqa uchun mo'ljallangan" deb hisoblanadi va
// ustuvorlik oladi (masalan "Reklama: @someone").
const CONTACT_KEYWORDS = [
  'reklama', 'admin', 'aloqa', 'contact', 'buyurtma', 'murojaat',
  'sotuvchi', 'menejer', 'manager', 'aloqa uchun', 'связь', 'по рекламе',
  'реклама', 'администратор', 'заказ', 'contact for ads', 'for ads', 'ads',
];

function normalizeHandle(handle) {
  return handle.toLowerCase();
}

/**
 * Matndan barcha @username'larni topadi (dublikatsiz, kichik harfda).
 */
export function extractUsernames(text) {
  if (!text) return [];
  const found = new Set();
  let match;
  USERNAME_RE.lastIndex = 0;
  while ((match = USERNAME_RE.exec(text)) !== null) {
    found.add(normalizeHandle(match[1]));
  }
  return Array.from(found);
}

/**
 * Kontakt uchun eng mos username'ni topadi:
 * 1) Kalit so'zga yaqin (bir xil qatorda yoki 40 belgi radiusda) joylashganlarga ustuvorlik.
 * 2) Aks holda, o'z kanali username'idan boshqa birinchi topilgan username.
 *
 * @param {string} text - description yoki post matni
 * @param {string|null} selfUsername - kanalning o'z username'i (chiqarib tashlash uchun)
 */
export function extractContactUsername(text, selfUsername = null) {
  if (!text) return null;
  const self = selfUsername ? normalizeHandle(selfUsername) : null;

  const lowerText = text.toLowerCase();
  let bestNearKeyword = null;

  let match;
  USERNAME_RE.lastIndex = 0;
  const candidates = [];
  while ((match = USERNAME_RE.exec(text)) !== null) {
    candidates.push({ handle: normalizeHandle(match[1]), index: match.index });
  }

  for (const { handle, index } of candidates) {
    if (self && handle === self) continue;
    const windowStart = Math.max(0, index - 40);
    const windowText = lowerText.slice(windowStart, index);
    if (CONTACT_KEYWORDS.some((kw) => windowText.includes(kw))) {
      bestNearKeyword = handle;
      break;
    }
  }

  if (bestNearKeyword) return bestNearKeyword;

  const fallback = candidates.find((c) => !self || c.handle !== self);
  return fallback ? fallback.handle : null;
}

// Telegram bot username'lari BotFather tomonidan majburiy "bot"/"_bot" bilan
// tugashi talab qilinadi — shuning uchun API chaqirmasdan ham ishonchli belgi.
export function isLikelyBotUsername(username) {
  if (!username) return false;
  return /bot$/i.test(username);
}

export default { extractUsernames, extractContactUsername, isLikelyBotUsername };
