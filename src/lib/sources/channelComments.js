import * as cheerio from 'cheerio';
import { fetchTelegramHtml, sleep, politeDelayMs } from './httpClient.js';
import { fetchChannelPostsPage } from './channelPosts.js';

const DEFAULT_MAX_POSTS = 20;

/**
 * `t.me/<username>/<message_id>?embed=1&discussion=1&comments_limit=100`
 * javobini parslab, izoh yozganlarni IngestedMessage[]'ga o'giradi. Kanal
 * topilmasa yoki izohlar yopiq bo'lsa Telegram "not found" sahifasi
 * qaytaradi — bu holatda widget belgilari (`.tgme_widget_message`) sahifada
 * umuman bo'lmaydi, shuning uchun natija tabiiy ravishda bo'sh massiv
 * bo'ladi (xato tashlanmaydi — chaqiruvchi buni oddiy "izoh yo'q" holati
 * sifatida qabul qiladi).
 */
export function parseChannelCommentsHtml(html, { sourceId }) {
  const $ = cheerio.load(html);
  const comments = [];

  $('.tgme_widget_message[data-post]').each((_, el) => {
    const node = $(el);
    const dataPost = node.attr('data-post') || '';
    const [commentChannel, idPart] = dataPost.split('/');
    const messageId = idPart ? parseInt(idPart, 10) : NaN;

    const textEl = node.find('.tgme_widget_message_text').first();
    textEl.find('br').replaceWith('\n');
    const text = textEl.text().trim();
    if (!text) return;

    const datetimeAttr = node.find('time').first().attr('datetime');
    const postedAt = datetimeAttr ? new Date(datetimeAttr) : null;

    // Izoh yozuvchining ismi/username'i widget'da turlicha markup'da
    // chiqishi mumkin — bir necha nomzod selector ketma-ket sinaladi.
    const authorNameEl = node
      .find('.tgme_widget_message_author_name, .tgme_widget_message_from_author, .tgme_widget_message_owner_name')
      .first();
    const displayName = authorNameEl.text().trim() || null;

    let username = null;
    const authorLink = node
      .find('.tgme_widget_message_author a, .tgme_widget_message_from_author a')
      .first()
      .attr('href');
    if (authorLink) {
      const match = authorLink.match(/t\.me\/([^/?#]+)/i);
      if (match) username = match[1];
    }

    const messageUrl = commentChannel && Number.isFinite(messageId) ? `https://t.me/${commentChannel}/${messageId}` : null;

    comments.push({
      sourceId,
      messageId: Number.isFinite(messageId) ? messageId : null,
      messageUrl,
      text,
      postedAt,
      username,
      displayName,
    });
  });

  return comments;
}

/** Bitta postning izohlarini yuklaydi (topilmasa/yopiq bo'lsa — bo'sh massiv). */
export async function fetchPostComments({ username, messageId, sourceId }) {
  const url = `https://t.me/${username}/${messageId}?embed=1&discussion=1&comments_limit=100`;
  const { html } = await fetchTelegramHtml(url);
  return parseChannelCommentsHtml(html, { sourceId });
}

/**
 * Kanalning eng so'nggi (Endpoint 1 orqali aniqlangan, `sinceMsgId`dan
 * yangi) postlari bo'yicha izohlarni yig'adi. Har bir post so'rovi orasida
 * "odob" kutish qo'llaniladi.
 */
export async function collectChannelComments({ username, sourceId, sinceMsgId = 0, maxPosts = DEFAULT_MAX_POSTS } = {}) {
  const { messages: recentPosts } = await fetchChannelPostsPage({ username, sourceId });
  const candidateIds = recentPosts
    .map((m) => m.messageId)
    .filter((id) => Number.isFinite(id) && id > sinceMsgId)
    .sort((a, b) => a - b)
    .slice(0, maxPosts);

  const collected = [];
  let newestMsgId = sinceMsgId;

  for (let i = 0; i < candidateIds.length; i += 1) {
    const postId = candidateIds[i];
    const comments = await fetchPostComments({ username, messageId: postId, sourceId });
    collected.push(...comments);
    if (postId > newestMsgId) newestMsgId = postId;
    if (i < candidateIds.length - 1) await sleep(politeDelayMs());
  }

  return { messages: collected, newestMsgId };
}

export default { parseChannelCommentsHtml, fetchPostComments, collectChannelComments };
