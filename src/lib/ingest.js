import { extractPhones } from './phone.js';
import { collectChannelPosts } from './sources/channelPosts.js';
import { collectChannelComments } from './sources/channelComments.js';
import { upsertGroupLead, updateSourceCursor } from '../db/groupLeads.js';
import { GROUP_LEAD_KEYWORDS } from '../config/seeds.js';

/**
 * Ingest quvuri: IngestedMessage[] → (ixtiyoriy) kalit so'z filtri →
 * extractPhones → upsert (ON CONFLICT DO NOTHING — suppression tekshiruvi
 * DB trigger'ida amalga oshadi, natija shu yerda o'qib olinadi).
 * `keywords` bo'sh bo'lsa filtr qo'llanmaydi — telefon topilgan HAR BIR
 * xabar ko'rib chiqiladi (bu standart holat).
 */
export async function ingestMessages(sourceId, messages, { keywords = [] } = {}) {
  const stats = { scanned: 0, matched: 0, phonesFound: 0, inserted: 0, duplicate: 0, suppressed: 0 };
  let newestMsgId = 0;

  for (const msg of messages) {
    stats.scanned += 1;
    const text = msg.text || '';

    let matchedKw = null;
    if (keywords.length > 0) {
      const lower = text.toLowerCase();
      matchedKw = keywords.find((k) => lower.includes(k.toLowerCase())) || null;
      if (!matchedKw) {
        if (msg.messageId != null && msg.messageId > newestMsgId) newestMsgId = msg.messageId;
        continue;
      }
    }
    stats.matched += 1;

    const phones = extractPhones(text);
    if (msg.messageId != null && msg.messageId > newestMsgId) newestMsgId = msg.messageId;
    if (phones.length === 0) continue;
    stats.phonesFound += phones.length;

    for (const phone of phones) {
      const result = await upsertGroupLead({
        sourceId,
        phoneE164: phone,
        username: msg.username,
        displayName: msg.displayName,
        messageId: msg.messageId,
        messageUrl: msg.messageUrl,
        messageText: text,
        matchedKw,
        postedAt: msg.postedAt,
      });
      if (result.inserted) {
        stats.inserted += 1;
        if (result.optedOut) stats.suppressed += 1;
      } else {
        stats.duplicate += 1;
      }
    }
  }

  return { ...stats, newestMsgId };
}

/**
 * Bitta manbani (kind bo'yicha to'g'ri kollektor tanlab) to'liq
 * sinxronlaydi: yig' → ingest qil → kursorni (last_seen_msg) siljitish.
 */
export async function syncSource(source, { keywords = GROUP_LEAD_KEYWORDS } = {}) {
  const sinceMsgId = source.last_seen_msg || 0;

  let collectResult;
  if (source.kind === 'channel_posts') {
    collectResult = await collectChannelPosts({ username: source.username, sourceId: source.id, sinceMsgId });
  } else if (source.kind === 'channel_comments') {
    collectResult = await collectChannelComments({ username: source.username, sourceId: source.id, sinceMsgId });
  } else {
    throw new Error(`Noma'lum manba turi: ${source.kind}`);
  }

  const stats = await ingestMessages(source.id, collectResult.messages, { keywords });
  const newCursor = Math.max(sinceMsgId, collectResult.newestMsgId || 0, stats.newestMsgId || 0);
  await updateSourceCursor(source.id, { lastSeenMsg: newCursor, lastSyncedAt: new Date() });

  const { newestMsgId, ...publicStats } = stats;
  return { ...publicStats, cursor: newCursor };
}

export default { ingestMessages, syncSource };
