import { Api } from 'telegram';
import { getPool } from '../telegram/client.js';
import { extractFirstPhone } from '../extract/phone.js';
import { extractContactUsername, isLikelyBotUsername } from '../extract/username.js';
import { isBlacklisted, BlacklistedError } from '../blacklist/blacklist.js';

function toInputChannel(chat) {
  return new Api.InputChannel({ channelId: chat.id, accessHash: chat.accessHash });
}

function detectLang(text) {
  if (!text) return null;
  const cyrillicCount = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (cyrillicCount === 0 && latinCount === 0) return null;

  if (cyrillicCount > latinCount) {
    const uzCyrillicMarkers = /[ЎўҚқҒғҲҳ]/;
    return uzCyrillicMarkers.test(text) ? 'uz' : 'ru';
  }

  const uzLatinMarkers = /(o'|g'|['’ʻ])|(\bbilan\b|\buchun\b|\bva\b|\bbo'ladi\b|\bkerak\b|\bhabar\b)/i;
  return uzLatinMarkers.test(text) ? 'uz' : 'other';
}

// Faqat guruh (megagroup) yoki linked-discussion-chat'i bor kanallar uchun
// ishlaydi — broadcast kanallarda admin ro'yxati tashqi userga ko'rinmaydi.
async function getAdminUsernames(pool, inputChannel) {
  try {
    const result = await pool.invoke(
      new Api.channels.GetParticipants({
        channel: inputChannel,
        filter: new Api.ChannelParticipantsAdmins(),
        offset: 0,
        limit: 50,
        hash: 0n,
      })
    );
    const users = result.users || [];
    return users.filter((u) => u.username && !u.bot).map((u) => u.username);
  } catch (err) {
    console.warn(`[enrich:admins] xato: ${err.message}`);
    return [];
  }
}

/**
 * Bitta discovery nomzodini to'liq boyitadi: description, pinned/recent
 * postlar, telefon/username ajratish, kerak bo'lsa admin ro'yxati.
 *
 * @param {import('../discovery/discovery.js').Candidate} candidate
 * @returns {Promise<object>} Lead modeliga mos partial obyekt
 */
export async function enrichCandidate(candidate, { recentLimit = 20 } = {}) {
  // Blacklist tekshiruvi — collector'ning eng pastki nuqtasi, har qanday
  // haqiqiy Telegram so'rovidan OLDIN. Bu yagona kirish nuqtasi bo'lgani
  // uchun (discovery faqat nomzod topadi, aslida shu yerda o'qiladi) hech
  // qanday chaqiruv yo'li buni chetlab o'ta olmaydi — istisno yo'q.
  if (await isBlacklisted(candidate.channel_id)) {
    throw new BlacklistedError(candidate.channel_id);
  }

  const pool = await getPool();
  const chat = candidate.entity;
  const inputChannel = toInputChannel(chat);

  let about = '';
  let linkedChatId = null;
  let participantsCount = candidate.subs ?? null;
  let pinnedMsgId = null;

  try {
    const full = await pool.invoke(new Api.channels.GetFullChannel({ channel: inputChannel }));
    about = full.fullChat?.about || '';
    linkedChatId = full.fullChat?.linkedChatId ? full.fullChat.linkedChatId.toString() : null;
    participantsCount = full.fullChat?.participantsCount ?? participantsCount;
    pinnedMsgId = full.fullChat?.pinnedMsgId || null;
  } catch (err) {
    console.warn(`[enrich] GetFullChannel xato "${candidate.title}": ${err.message}`);
  }

  let pinnedText = '';
  if (pinnedMsgId) {
    try {
      const pinnedResult = await pool.invoke(
        new Api.channels.GetMessages({
          channel: inputChannel,
          id: [new Api.InputMessageID({ id: pinnedMsgId })],
        })
      );
      pinnedText = pinnedResult.messages?.[0]?.message || '';
    } catch (err) {
      console.warn(`[enrich] pinned xabar xato "${candidate.title}": ${err.message}`);
    }
  }

  let recentTexts = [];
  try {
    const history = await pool.invoke(
      new Api.messages.GetHistory({
        peer: inputChannel,
        limit: recentLimit,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        maxId: 0,
        minId: 0,
        hash: 0n,
      })
    );
    recentTexts = (history.messages || []).map((m) => m.message).filter(Boolean);
  } catch (err) {
    console.warn(`[enrich] tarix xato "${candidate.title}": ${err.message}`);
  }

  const combinedText = [about, pinnedText, ...recentTexts].filter(Boolean).join('\n');

  const phone = extractFirstPhone(combinedText);
  let contactUsername = extractContactUsername(combinedText, candidate.username);
  // Matndan chiqarilgan username haqiqatan bot ekanligini API'siz bilib
  // bo'lmaydi — shuning uchun nom bo'yicha heuristika ishlatiladi (pastga qarang).
  let contactIsBot = contactUsername ? isLikelyBotUsername(contactUsername) : false;

  // Matnda kontakt topilmasa va bu guruh/linked-discussion bo'lsa, admin
  // username'laridan birinchisini olamiz.
  if (!contactUsername && (candidate.type === 'group' || linkedChatId)) {
    const admins = await getAdminUsernames(pool, inputChannel);
    if (admins.length > 0) {
      contactUsername = admins[0];
      // getAdminUsernames haqiqiy Telegram .bot flagi bo'yicha botlarni
      // allaqachon chiqarib tashlagan.
      contactIsBot = false;
    }
  }

  const contact_type = phone && contactUsername ? 'both' : phone ? 'phone' : contactUsername ? 'username' : 'none';

  return {
    channel_title: candidate.title,
    channel_username: candidate.username || null,
    channel_id: candidate.channel_id,
    type: candidate.type,
    subs: participantsCount,
    lang: detectLang(`${candidate.title}\n${about}`),
    description: about || null,
    phone,
    contact_username: contactUsername,
    contact_is_bot: contactIsBot,
    contact_type,
    matched_keyword: candidate.matched_keyword || null,
    source: candidate.source,
  };
}

export default { enrichCandidate };
