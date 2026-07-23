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
 * yig'adi. `captureSenders: true` bo'lsa guruh xabarlari yuboruvchilarining
 * username'larini ham qo'shimcha yig'adi; broadcast kanal uchun linked
 * discussion group'idagi izoh yozganlar ham yig'iladi.
 */
export async function scanChannel(pool, { identifier, dateFromSec, dateToSec, keywords = [], captureSenders = false } = {}) {
  const chat = await resolveChannelOrGroup(pool, identifier);
  const channelId = chat.id.toString();

  // Blacklist tekshiruvi — har qanday GetHistory chaqiruvidan OLDIN,
  // enrichCandidate()dagi bilan bir xil bypasssiz nuqta.
  if (await isBlacklisted(channelId)) {
    throw new BlacklistedError(channelId);
  }

  const inputChannel = toInputChannel(chat);
  const found = new Map();
  const selfUsername = (chat.username || '').toLowerCase();
  // Xabar yuboruvchilar uchun: userId → username lug'ati (barcha sahifalar bo'yicha)
  const usersMap = new Map();
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

    // Yuboruvchi username lug'atini yangilash (GetHistory users massividan)
    if (captureSenders) {
      for (const u of (history.users || [])) {
        if (u.username && !usersMap.has(u.id.toString())) {
          usersMap.set(u.id.toString(), u.username.toLowerCase());
        }
      }
    }

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

      // Guruh xabari yuboruvchisini yig' (sanadan qat'i nazar, kalit so'zsiz)
      if (captureSenders && msg.fromId?.className === 'PeerUser') {
        const userId = msg.fromId.userId.toString();
        const uname = usersMap.get(userId);
        if (uname && uname !== selfUsername) {
          const key = `username:${uname}`;
          const existing = found.get(key);
          if (existing) {
            existing.match_count += 1;
          } else {
            found.set(key, {
              contact_type: 'username',
              contact_value: uname,
              is_bot: isLikelyBotUsername(uname),
              message_id: msg.id,
              message_date: new Date(msg.date * 1000),
              message_excerpt: null,
              matched_keyword: 'sender',
              match_count: 1,
            });
          }
        }
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
            message_id: msg.id,
            message_date: messageDate,
            message_excerpt: excerptOf(text),
            matched_keyword: matchedKeyword,
            match_count: 1,
          });
        }
      }

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
            message_id: msg.id,
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

  // Broadcast kanal bo'lsa va captureSenders yoqlangan bo'lsa —
  // linked discussion group'ini (izohlar guruhi) ham skanerlaydi.
  if (captureSenders && !chat.megagroup && chat.broadcast) {
    try {
      const fullChannel = await pool.invoke(
        new Api.channels.GetFullChannel({ channel: inputChannel }),
        { cancellationToken: scanCancellation }
      );
      const linkedChatId = fullChannel.fullChat?.linkedChatId;
      if (linkedChatId) {
        const linkedChat = (fullChannel.chats || []).find((c) => {
          const cid = typeof c.id === 'bigint' ? c.id : BigInt(c.id);
          const lid = typeof linkedChatId === 'bigint' ? linkedChatId : BigInt(linkedChatId);
          return cid === lid;
        });
        if (linkedChat) {
          const linkedInput = new Api.InputChannel({ channelId: linkedChat.id, accessHash: linkedChat.accessHash });
          const linkedUsersMap = new Map();
          let linkedOffsetId = 0;
          let linkedScanned = 0;
          let linkedReachedStart = false;

          while (linkedScanned < MAX_MESSAGES) {
            scanCancellation.throwIfCancelled();
            const lHistory = await pool.invoke(
              new Api.messages.GetHistory({
                peer: linkedInput,
                limit: PAGE_SIZE,
                offsetId: linkedOffsetId,
                offsetDate: 0,
                addOffset: 0,
                maxId: 0,
                minId: 0,
                hash: 0n,
              }),
              { cancellationToken: scanCancellation }
            );
            const lMessages = lHistory.messages || [];
            if (lMessages.length === 0) break;

            for (const u of (lHistory.users || [])) {
              if (u.username && !linkedUsersMap.has(u.id.toString())) {
                linkedUsersMap.set(u.id.toString(), u.username.toLowerCase());
              }
            }

            for (const msg of lMessages) {
              if (isMessageTooOld(msg, dateFromSec)) { linkedReachedStart = true; break; }
              linkedScanned += 1;
              if (msg.fromId?.className === 'PeerUser') {
                const userId = msg.fromId.userId.toString();
                const uname = linkedUsersMap.get(userId);
                if (uname && uname !== selfUsername) {
                  const key = `username:${uname}`;
                  const existing = found.get(key);
                  if (existing) {
                    existing.match_count += 1;
                  } else {
                    found.set(key, {
                      contact_type: 'username',
                      contact_value: uname,
                      is_bot: isLikelyBotUsername(uname),
                      message_id: msg.id,
                      message_date: new Date(msg.date * 1000),
                      message_excerpt: null,
                      matched_keyword: 'comment_sender',
                      match_count: 1,
                    });
                  }
                }
              }
            }
            if (linkedReachedStart || lMessages.length < PAGE_SIZE) break;
            linkedOffsetId = lMessages[lMessages.length - 1].id;
          }
          scanned += linkedScanned;
        }
      }
    } catch (err) {
      // Linked discussion group yo'q yoki kirish mumkin emas — jim o'tamiz
      console.warn('[scan] linked discussion group skanerlashda xato:', err.message);
    }
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
