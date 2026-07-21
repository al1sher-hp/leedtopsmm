import { Api } from 'telegram';
import { extractPhones } from '../extract/phone.js';
import { extractUsernames, isLikelyBotUsername } from '../extract/username.js';
import { isBlacklisted, BlacklistedError } from '../blacklist/blacklist.js';
import { scanCancellation } from '../jobs/scanCancellation.js';

// Xavfsizlik cap'i — sana oralig'i juda keng bo'lsa ham cheksiz sahifalab
// ketmasin. Yetilsa aniq xabar qilinadi (jim to'xtab, "hammasi tekshirildi"
// degan noto'g'ri taassurot qoldirilmaydi).
const MAX_MESSAGES = 3000;
const PAGE_SIZE = 100;

function toInputChannel(chat) {
  return new Api.InputChannel({ channelId: chat.id, accessHash: chat.accessHash });
}

/** Faqat ochiq (username'li) kanal/guruh qabul qilinadi — bot/oddiy user emas. */
export async function resolveChannelOrGroup(pool, username) {
  const resolved = await pool.invoke(new Api.contacts.ResolveUsername({ username }), {
    cancellationToken: scanCancellation,
  });
  const chat = resolved.chats?.[0];
  if (!chat || chat.className !== 'Channel') {
    throw new Error("Faqat ochiq kanal yoki guruh username/havolasi qo'llab-quvvatlanadi.");
  }
  return chat;
}

/** Xabar so'ralgan sana oralig'idan eskimi — sahifalashni to'xtatish signali. */
export function isMessageTooOld(msg, dateFromSec) {
  return dateFromSec != null && msg.date < dateFromSec;
}

/** Xabar kontakt qidirish uchun ko'rib chiqilishi kerakmi (sana + kalit so'z). */
export function shouldIncludeMessage(msg, { dateFromSec, dateToSec, keywords = [] } = {}) {
  if (!msg || !msg.date) return false;
  if (isMessageTooOld(msg, dateFromSec)) return false;
  if (dateToSec != null && msg.date > dateToSec) return false;

  const text = msg.message || '';
  if (!text) return false;

  if (keywords.length > 0) {
    const lower = text.toLowerCase();
    if (!keywords.some((k) => lower.includes(k.toLowerCase()))) return false;
  }
  return true;
}

function excerptOf(text) {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * Bitta kanal/guruhning postlari/xabarlari matnidan (sana oralig'ida,
 * ixtiyoriy kalit so'z bilan filtrlab) ochiq yozilgan telefon/username'larni
 * yig'adi. Xabar yuboruvchisining o'zi (user_id/username) HECH QACHON
 * saqlanmaydi — faqat matn ichida odam o'zi ochiq yozgan kontakt.
 */
export async function scanChannel(pool, { identifier, dateFromSec, dateToSec, keywords = [] } = {}) {
  const chat = await resolveChannelOrGroup(pool, identifier);
  const channelId = chat.id.toString();

  // Blacklist tekshiruvi — har qanday GetHistory chaqiruvidan OLDIN,
  // enrichCandidate()dagi bilan bir xil bypasssiz nuqta.
  if (await isBlacklisted(channelId)) {
    throw new BlacklistedError(channelId);
  }

  const inputChannel = toInputChannel(chat);
  const found = new Map();
  let offsetId = 0;
  let scanned = 0;
  let hitCap = false;
  let reachedStart = false;

  while (true) {
    scanCancellation.throwIfCancelled();

    const history = await pool.invoke(
      new Api.messages.GetHistory({
        peer: inputChannel,
        limit: PAGE_SIZE,
        offsetId,
        offsetDate: 0,
        addOffset: 0,
        maxId: 0,
        minId: 0,
        hash: 0n,
      }),
      { cancellationToken: scanCancellation }
    );
    const messages = history.messages || [];
    if (messages.length === 0) break;

    for (const msg of messages) {
      if (isMessageTooOld(msg, dateFromSec)) {
        reachedStart = true;
        break;
      }
      scanned += 1;
      if (scanned > MAX_MESSAGES) {
        hitCap = true;
        break;
      }
      if (!shouldIncludeMessage(msg, { dateFromSec, dateToSec, keywords })) continue;

      const text = msg.message || '';
      const messageDate = new Date(msg.date * 1000);
      const matchedKeyword =
        keywords.find((k) => text.toLowerCase().includes(k.toLowerCase())) || null;

      for (const phone of extractPhones(text)) {
        const key = `phone:${phone}`;
        const existing = found.get(key);
        if (existing) {
          existing.match_count += 1;
        } else {
          found.set(key, {
            contact_type: 'phone',
            contact_value: phone,
            is_bot: false,
            message_date: messageDate,
            message_excerpt: excerptOf(text),
            matched_keyword: matchedKeyword,
            match_count: 1,
          });
        }
      }

      const selfUsername = (chat.username || '').toLowerCase();
      for (const uname of extractUsernames(text)) {
        if (uname === selfUsername) continue;
        const key = `username:${uname}`;
        const existing = found.get(key);
        if (existing) {
          existing.match_count += 1;
        } else {
          found.set(key, {
            contact_type: 'username',
            contact_value: uname,
            is_bot: isLikelyBotUsername(uname),
            message_date: messageDate,
            message_excerpt: excerptOf(text),
            matched_keyword: matchedKeyword,
            match_count: 1,
          });
        }
      }
    }

    if (reachedStart || hitCap) break;
    if (messages.length < PAGE_SIZE) break; // tarix tugadi
    offsetId = messages[messages.length - 1].id;
  }

  return {
    target: {
      channel_id: channelId,
      username: chat.username || null,
      title: chat.title,
      type: chat.megagroup ? 'group' : 'channel',
    },
    results: Array.from(found.values()),
    scannedMessages: scanned,
    hitCap,
  };
}

export default { resolveChannelOrGroup, scanChannel, shouldIncludeMessage, isMessageTooOld };
