import { Api } from 'telegram';
import { getPool } from '../telegram/client.js';
import { SEARCH_KEYWORDS, CATALOG_CHANNELS } from '../config/seeds.js';
import config from '../config/index.js';
import { extractUsernames } from '../extract/username.js';
import { pipelineCancellation } from '../jobs/cancellation.js';

/**
 * @typedef {Object} Candidate
 * @property {string} channel_id
 * @property {string} title
 * @property {string|null} username
 * @property {'channel'|'group'} type
 * @property {number|null} subs
 * @property {string} source - 'search' | 'similar' | 'catalog'
 * @property {any} entity - GramJS xom Channel/Chat obyekti (keyingi bosqichlar uchun)
 */

function chatToCandidate(chat, source) {
  if (!chat) return null;
  if (chat.className === 'Channel') {
    return {
      channel_id: chat.id.toString(),
      title: chat.title,
      username: chat.username || null,
      type: chat.megagroup ? 'group' : 'channel',
      subs: chat.participantsCount ?? null,
      source,
      entity: chat,
    };
  }
  if (chat.className === 'Chat') {
    return {
      channel_id: chat.id.toString(),
      title: chat.title,
      username: null,
      type: 'group',
      subs: chat.participantsCount ?? null,
      source,
      entity: chat,
    };
  }
  return null;
}

function toInputChannel(chat) {
  return new Api.InputChannel({ channelId: chat.id, accessHash: chat.accessHash });
}

/** 1-usul: global qidiruv (seed keyword'lar bo'yicha). */
export async function searchByKeywords(keywords = SEARCH_KEYWORDS, { limit = 20 } = {}) {
  const pool = await getPool();
  const candidates = new Map();

  for (const q of keywords) {
    pipelineCancellation.throwIfCancelled();
    console.log(`[discovery:search] "${q}" qidirilmoqda...`);
    try {
      const result = await pool.invoke(new Api.contacts.Search({ q, limit }));
      const chats = result.chats || [];
      for (const chat of chats) {
        const candidate = chatToCandidate(chat, 'search');
        if (!candidate) continue;
        // Bir kanal bir nechta kalit so'z bo'yicha topilishi mumkin — birinchi
        // topilgan kalit so'zni saqlaymiz, keyingilari ustidan yozmaymiz.
        if (candidates.has(candidate.channel_id)) continue;
        candidate.matched_keyword = q;
        candidates.set(candidate.channel_id, candidate);
      }
    } catch (err) {
      console.warn(`[discovery:search] "${q}" uchun xato: ${err.message}`);
    }
  }

  return Array.from(candidates.values());
}

/** 2-usul: topilgan kanallardan o'xshashlarini BFS bilan kengaytirish. */
export async function findSimilarChannels(seedCandidates, { depth = config.discovery.depth } = {}) {
  const pool = await getPool();
  const visited = new Set(seedCandidates.map((c) => c.channel_id));
  const results = new Map();
  let frontier = seedCandidates.slice();

  for (let level = 0; level < depth; level++) {
    const nextFrontier = [];
    for (const candidate of frontier) {
      pipelineCancellation.throwIfCancelled();
      if (!candidate.entity || candidate.entity.className !== 'Channel') continue;
      try {
        console.log(
          `[discovery:similar] depth=${level + 1} "${candidate.title}" uchun o'xshashlar qidirilmoqda...`
        );
        const result = await pool.invoke(
          new Api.channels.GetChannelRecommendations({ channel: toInputChannel(candidate.entity) })
        );
        const chats = result.chats || [];
        for (const chat of chats) {
          const c = chatToCandidate(chat, 'similar');
          if (!c || visited.has(c.channel_id)) continue;
          visited.add(c.channel_id);
          // Topilgan manba kanalning kalit so'zini meros qilib olamiz — shu
          // orqali "o'xshash" natijalar ham keyword filtriga tushadi.
          c.matched_keyword = candidate.matched_keyword || null;
          results.set(c.channel_id, c);
          nextFrontier.push(c);
        }
      } catch (err) {
        console.warn(`[discovery:similar] "${candidate.title}" uchun xato: ${err.message}`);
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return Array.from(results.values());
}

/** 3-usul: katalog/reklama-birja kanallaridagi @username havolalarini o'qish. */
export async function discoverFromCatalog(catalogUsernames = CATALOG_CHANNELS, { messageLimit = 50 } = {}) {
  const pool = await getPool();
  const results = new Map();

  for (const username of catalogUsernames) {
    pipelineCancellation.throwIfCancelled();
    try {
      console.log(`[discovery:catalog] "@${username}" o'qilmoqda...`);
      const resolved = await pool.invoke(new Api.contacts.ResolveUsername({ username }));
      const chat = resolved.chats?.[0];
      if (!chat || chat.className !== 'Channel') continue;
      const inputChannel = toInputChannel(chat);

      const full = await pool.invoke(new Api.channels.GetFullChannel({ channel: inputChannel }));
      const about = full.fullChat?.about || '';

      const history = await pool.invoke(
        new Api.messages.GetHistory({ peer: inputChannel, limit: messageLimit, offsetId: 0, offsetDate: 0, addOffset: 0, maxId: 0, minId: 0, hash: 0n })
      );
      const messageTexts = (history.messages || []).map((m) => m.message).filter(Boolean);

      const allText = [about, ...messageTexts].join('\n');
      const foundUsernames = extractUsernames(allText);

      for (const uname of foundUsernames) {
        if (uname === username.toLowerCase()) continue;
        if (results.has(uname)) continue;
        try {
          const res = await pool.invoke(new Api.contacts.ResolveUsername({ username: uname }));
          const candChat = res.chats?.[0];
          const candidate = chatToCandidate(candChat, 'catalog');
          if (candidate) results.set(candidate.channel_id, candidate);
        } catch (err) {
          console.warn(`[discovery:catalog] "@${uname}" resolve xato: ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`[discovery:catalog] "@${username}" uchun xato: ${err.message}`);
    }
  }

  return Array.from(results.values());
}

/**
 * Uch usulni birlashtirib, dedup qilingan nomzodlar ro'yxatini qaytaradi.
 * `keywords` berilsa (masalan dashboard'dan), o'sha so'zlar bilan qidiradi;
 * berilmasa (masalan `npm run pipeline` to'g'ridan-to'g'ri ishga tushirilganda)
 * config/seeds.js'dagi standart ro'yxatga tushadi.
 */
export async function runDiscovery({ keywords } = {}) {
  const effectiveKeywords = keywords && keywords.length > 0 ? keywords : SEARCH_KEYWORDS;
  const seedResults = await searchByKeywords(effectiveKeywords);
  console.log(`[discovery] search orqali ${seedResults.length} ta nomzod topildi`);

  const similarResults = await findSimilarChannels(seedResults);
  console.log(`[discovery] similar orqali ${similarResults.length} ta qo'shimcha nomzod topildi`);

  const catalogResults = await discoverFromCatalog();
  console.log(`[discovery] catalog orqali ${catalogResults.length} ta qo'shimcha nomzod topildi`);

  const merged = new Map();
  for (const c of [...seedResults, ...similarResults, ...catalogResults]) {
    if (!merged.has(c.channel_id)) merged.set(c.channel_id, c);
  }

  console.log(`[discovery] jami noyob nomzodlar: ${merged.size}`);
  return Array.from(merged.values());
}

export default { searchByKeywords, findSimilarChannels, discoverFromCatalog, runDiscovery };
