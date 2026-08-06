import * as cheerio from 'cheerio';
import { fetchTelegramHtml, sleep, politeDelayMs } from './httpClient.js';

/**
 * @typedef {Object} IngestedMessage
 * @property {number} sourceId
 * @property {number|null} messageId
 * @property {string|null} messageUrl
 * @property {string} text
 * @property {Date|null} postedAt
 * @property {string|null} [username]
 * @property {string|null} [displayName]
 */

const DEFAULT_MAX_PAGES = 20;

/**
 * `t.me/s/<username>` (yoki `?before=<id>` bilan) HTML javobini cheerio
 * bilan parslab, ushbu sahifadagi barcha postlarni IngestedMessage[]'ga
 * o'giradi. Sahifa markup'i (task ta'rifiga mos):
 *
 *   <div class="tgme_widget_message ..." data-post="channelname/425">
 *     <div class="tgme_widget_message_text ...">post matni</div>
 *     <time datetime="2026-02-14T17:43:12+00:00">
 *   </div>
 */
export function parseChannelPostsHtml(html, { username, sourceId }) {
  const $ = cheerio.load(html);
  const messages = [];
  let minId = null;
  let maxId = null;

  $('.tgme_widget_message[data-post]').each((_, el) => {
    const node = $(el);
    const dataPost = node.attr('data-post') || '';
    const [postChannel, idPart] = dataPost.split('/');
    const messageId = idPart ? parseInt(idPart, 10) : NaN;
    if (!Number.isFinite(messageId)) return;

    // <br> qatorlar orasidagi ajratuvchi — matn sifatida olinmasa telefon
    // raqamining bir qismi keyingi qatordagi so'zga yopishib qolishi mumkin.
    const textEl = node.find('.tgme_widget_message_text').first();
    textEl.find('br').replaceWith('\n');
    const text = textEl.text().trim();

    const datetimeAttr = node.find('time').first().attr('datetime');
    const postedAt = datetimeAttr ? new Date(datetimeAttr) : null;

    const channelForUrl = postChannel || username;
    const messageUrl = channelForUrl ? `https://t.me/${channelForUrl}/${messageId}` : null;

    if (minId === null || messageId < minId) minId = messageId;
    if (maxId === null || messageId > maxId) maxId = messageId;

    messages.push({
      sourceId,
      messageId,
      messageUrl,
      text,
      postedAt,
      username: null,
      displayName: null,
    });
  });

  return { messages, minId, maxId };
}

/** Bitta sahifani (ixtiyoriy `before` kursori bilan) yuklab, parslaydi. */
export async function fetchChannelPostsPage({ username, sourceId, beforeId } = {}) {
  const url = beforeId
    ? `https://t.me/s/${username}?before=${beforeId}`
    : `https://t.me/s/${username}`;
  const { html } = await fetchTelegramHtml(url);
  return parseChannelPostsHtml(html, { username, sourceId });
}

/**
 * Kanalning `?before=` orqali orqaga sahifalab, `sinceMsgId` kursorigacha
 * (undan katta message_id'lar) barcha yangi postlarni yig'adi. So'rovlar
 * orasida 1.5-2s "odob" kutish qo'llaniladi.
 */
export async function collectChannelPosts({ username, sourceId, sinceMsgId = 0, maxPages = DEFAULT_MAX_PAGES } = {}) {
  const collected = [];
  let beforeId;
  let newestMsgId = sinceMsgId;

  for (let page = 0; page < maxPages; page += 1) {
    const { messages, minId } = await fetchChannelPostsPage({ username, sourceId, beforeId });
    if (messages.length === 0) break;

    for (const msg of messages) {
      if (msg.messageId != null && msg.messageId > sinceMsgId) {
        collected.push(msg);
        if (msg.messageId > newestMsgId) newestMsgId = msg.messageId;
      }
    }

    // Shu sahifadagi eng eski post allaqachon ko'rilgan bo'lsa — undan
    // orqada faqat allaqachon ma'lum postlar bo'ladi, sahifalashni to'xtatamiz.
    if (minId === null || minId <= sinceMsgId) break;

    beforeId = minId;
    if (page < maxPages - 1) await sleep(politeDelayMs());
  }

  return { messages: collected, newestMsgId };
}

export default { parseChannelPostsHtml, fetchChannelPostsPage, collectChannelPosts };
