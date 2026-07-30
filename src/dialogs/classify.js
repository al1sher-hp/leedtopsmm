import { Api } from 'telegram';
import { getPool } from '../telegram/client.js';
import { DialogContact, JobRun } from '../db/models.js';
import { PREMIUM_KEYWORDS } from '../config/seeds.js';
import { verifyPremiumInterest } from '../score/gemini.js';
import { dialogsClassifyCancellation } from '../jobs/dialogsClassifyCancellation.js';

const DEFAULT_THRESHOLD = 3;
const DEFAULT_MESSAGE_LIMIT = 300;
const DEFAULT_DIALOG_LIMIT = 500;
const HISTORY_PAGE_SIZE = 100;
// Gemini'ga har bir nomzod uchun ko'pi bilan shuncha xabar namunasi
// yuboriladi — narxni tejash va prompt hajmini nazorat qilish uchun.
const AI_SAMPLE_SIZE = 10;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// So'z/ibora chegarasi bilan mos kelish — `\b` o'rniga Unicode harf/raqam
// klassidan (\p{L}/\p{N}) foydalanadi, chunki JS'ning standart `\b`si faqat
// ASCII so'z belgilarini taniydi va kirill harflarida (масалан "премиум")
// noto'g'ri ishlaydi. "premiumniki" kabi ichiga singib ketgan holatlar mos
// kelmaydi — atrofida harf/raqam bo'lmasa GINA mos keladi.
function buildKeywordRegex(keywords) {
  const alternatives = keywords.map(escapeRegExp).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, 'iu');
}

export function messageMatchesKeywords(text, keywords) {
  if (!text) return false;
  return buildKeywordRegex(keywords).test(text);
}

// Berilgan InputPeer uchun eng so'nggi (ko'pi bilan `messageLimit` ta)
// xabarni sahifalab o'qiydi.
async function fetchRecentMessages(pool, inputPeer, messageLimit, cancellationToken) {
  const collected = [];
  let offsetId = 0;

  while (collected.length < messageLimit) {
    cancellationToken.throwIfCancelled();
    const batchLimit = Math.min(HISTORY_PAGE_SIZE, messageLimit - collected.length);
    const result = await pool.invoke(
      new Api.messages.GetHistory({
        peer: inputPeer,
        limit: batchLimit,
        offsetId,
        offsetDate: 0,
        addOffset: 0,
        maxId: 0,
        minId: 0,
        hash: 0n,
      }),
      { cancellationToken }
    );

    const messages = result.messages || [];
    if (messages.length === 0) break;
    collected.push(...messages);
    if (messages.length < batchLimit) break;
    offsetId = messages[messages.length - 1].id;
  }

  return collected;
}

// Elapsed/processed nisbatidan qolgan vaqtni taxmin qiladi (soniyada).
// Taxminiy: 500 dialog uchun odatda ~40-70 daqiqa (har bir dialog uchun bir
// nechta GetHistory chaqiruvi + odam-o'xshash kutish vaqtlari).
function estimateRemainingSeconds(startedAt, processed, total) {
  if (processed === 0 || total === 0) return null;
  const elapsedMs = Date.now() - startedAt;
  const avgMsPerItem = elapsedMs / processed;
  return Math.round((avgMsPerItem * Math.max(total - processed, 0)) / 1000);
}

/**
 * Bitta DialogContact'ning oxirgi xabarlarini o'qib, premium'ga qiziqish
 * ko'rsatkichini hisoblaydi. FAQAT suhbatdoshning (out=false) xabarlari
 * hisoblanadi — o'zimiz yuborgan xabarlar (masalan reklama matnimiz)
 * statistikani buzmasligi uchun. Bitta xabarda kalit so'z bir necha marta
 * uchrasa ham 1 deb sanaladi (Abbos: "3-4 ta YOZISHMA", so'z soni emas).
 */
export async function classifyOneContact(
  pool,
  contact,
  { keywords, threshold, aiVerify, messageLimit = DEFAULT_MESSAGE_LIMIT }
) {
  const inputPeer = await pool.primaryClient.getInputEntity(contact.tg_user_id);
  const messages = await fetchRecentMessages(pool, inputPeer, messageLimit, dialogsClassifyCancellation);

  const incoming = messages.filter((m) => !m.out);
  const matchingMessages = incoming.filter((m) => messageMatchesKeywords(m.message, keywords));
  const mentions = matchingMessages.length;

  const updates = { premium_mentions: mentions, classified_at: new Date(), ai_rejected: false };
  let aiChecked = false;

  if (mentions >= threshold && aiVerify) {
    aiChecked = true;
    const samples = matchingMessages.slice(0, AI_SAMPLE_SIZE).map((m) => m.message);
    const { interested } = await verifyPremiumInterest(samples);
    updates.ai_rejected = !interested;
  }

  await contact.update(updates);

  return { mentions, matched: mentions >= threshold, aiChecked, aiRejected: updates.ai_rejected };
}

// Asosiy sikl — `pool` tashqaridan uzatiladi (test'larda mock bilan
// almashtiriladi), `job` progress/holatni saqlaydigan JobRun yozuvi.
export async function runDialogsClassify(pool, job, opts = {}) {
  const {
    keywords = PREMIUM_KEYWORDS,
    threshold = DEFAULT_THRESHOLD,
    aiVerify = false,
    messageLimit = DEFAULT_MESSAGE_LIMIT,
    dialogLimit = DEFAULT_DIALOG_LIMIT,
  } = opts;

  const stats = { scanned: 0, matched: 0, ai_checked: 0, ai_rejected: 0, failed: 0 };
  const startedAt = Date.now();
  let cancelled = false;

  // opted_out=true bo'lganlar BUTUNLAY chetlab o'tiladi — so'rovning o'zida
  // qatnashmaydi.
  const contacts = await DialogContact.findAll({
    where: { opted_out: false },
    order: [['last_message_at', 'DESC']],
    limit: dialogLimit,
  });

  const total = contacts.length;
  let processed = 0;

  const persistProgress = (status) =>
    job.update({
      status,
      total,
      done: processed,
      ok_count: stats.matched,
      failed_count: stats.failed,
      params_json: {
        ...job.params_json,
        eta_seconds: estimateRemainingSeconds(startedAt, processed, total),
      },
    });

  try {
    for (const contact of contacts) {
      dialogsClassifyCancellation.throwIfCancelled();
      processed += 1;
      stats.scanned += 1;

      try {
        const result = await classifyOneContact(pool, contact, { keywords, threshold, aiVerify, messageLimit });
        if (result.matched) stats.matched += 1;
        if (result.aiChecked) stats.ai_checked += 1;
        if (result.aiRejected) stats.ai_rejected += 1;
      } catch (err) {
        stats.failed += 1;
        console.error(`[dialogs] classify ${contact.tg_user_id} uchun xato:`, err.message);
      }

      await persistProgress('running');
    }

    await persistProgress('completed');
  } catch (err) {
    if (err.isCancellation) {
      cancelled = true;
      await persistProgress('cancelled');
    } else {
      await job.update({ status: 'failed', error_message: err.message });
      throw err;
    }
  }

  return { cancelled, ...stats };
}

/**
 * Lichka yozishmalarini tahlil qilib, premium'ga qiziqqan nomzodlarni
 * ajratadi (`premium_mentions`/`classified_at`/`ai_rejected` yangilanadi).
 * `threshold`dan o'tganlargina (ixtiyoriy) Gemini orqali ikkinchi marta
 * tekshiriladi — xarajatni tejash uchun hammaga emas, faqat nomzodlarga.
 *
 * Og'ir Telegram/Gemini ishi FON REJIMIDA ishlaydi (dialogs/sync.js dagi
 * bilan bir xil "start + poll" naqshi) — JobRun darhol yaratiladi va uning
 * id'si qaytadi.
 */
export async function classifyDialogs({
  keywords = PREMIUM_KEYWORDS,
  threshold = DEFAULT_THRESHOLD,
  aiVerify = false,
  messageLimit = DEFAULT_MESSAGE_LIMIT,
  dialogLimit = DEFAULT_DIALOG_LIMIT,
} = {}) {
  const pool = await getPool();
  dialogsClassifyCancellation.reset();

  const job = await JobRun.create({
    kind: 'dialogs_classify',
    status: 'running',
    params_json: { keywords, threshold, aiVerify, messageLimit, dialogLimit },
  });

  const donePromise = runDialogsClassify(pool, job, { keywords, threshold, aiVerify, messageLimit, dialogLimit });

  return { jobId: job.id, donePromise };
}

export default { classifyDialogs, runDialogsClassify, classifyOneContact, messageMatchesKeywords };
