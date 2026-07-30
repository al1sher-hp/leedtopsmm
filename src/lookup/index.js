import * as cache from './cache.js';
import { assertAllowed } from './guard.js';
import { lookupViaGramjs } from './providers/gramjs.js';
import { lookupViaTgBot } from './providers/tgbot.js';
import { record } from './audit.js';
import { JobRun, LookupJobResult } from '../db/models.js';
import config from '../config/index.js';

// Kunlik cap'ga TA'SIR QILMAYDI (guard.js faqat provider:'tgbot' sanaydi) —
// kesh natijasi audit uchun qayd etiladi, lekin bu real tashqi so'rov emas.
const CACHE_PROVIDER = 'cache';

const PROVIDERS = {
  gramjs: lookupViaGramjs,
  tgbot: lookupViaTgBot,
};

const EMPTY_RESULT = {
  found: false,
  phone: null,
  username: null,
  user_id: null,
  first_name: null,
  last_name: null,
  is_bot: false,
  provider: null,
  confidence: null,
  source_note: null,
};

function fromCacheRow(query, row) {
  return {
    found: row.found,
    phone: row.phone,
    username: query,
    user_id: row.tg_user_id,
    first_name: row.first_name,
    last_name: row.last_name,
    is_bot: row.is_bot,
    provider: row.provider,
    confidence: row.confidence,
    source_note: row.source_note,
    fromCache: true,
  };
}

/**
 * Zanjir bo'ylab qidiradi: cache -> guard -> gramjs -> tgbot -> audit.
 * Birinchi topgan (found:true) provider natijasi qaytariladi, qolganlari
 * chaqirilmaydi. Har bir haqiqatan chaqirilgan provider urinishi audit
 * qilinadi (topilgan yoki yo'q — HIMOYA #3, majburiy), lekin faqat ZANJIR
 * TUGAGANDA tanlangan yakuniy natija keshga yoziladi (oraliq "topilmadi"
 * natijalar keshni chalkashtirmasin uchun).
 */
export async function resolve(query, { purpose, actor = 'api', provider } = {}) {
  const cleanQuery = query.trim().replace(/^@/, '');

  // HIMOYA #1/#2/#4: blacklist/opted_out/kunlik cap — HECH QANDAY provider
  // chaqirilishidan OLDIN tekshiriladi.
  await assertAllowed(cleanQuery);

  const cached = await cache.get(cleanQuery);
  if (cached) {
    // HIMOYA #3: kesh hit ham audit qilinadi — "hech qanday lookup
    // yozilmasdan qolib ketmaydi" kafolati kesh yo'lida ham amal qiladi.
    // provider:'cache' — bu HAQIQIY tashqi so'rov emas, shuning uchun
    // kunlik cap'ga ta'sir qilmaydi (guard.js faqat provider:'tgbot' sanaydi).
    await record({
      query: cleanQuery,
      provider: CACHE_PROVIDER,
      found: cached.found,
      actor,
      purpose,
      phone: cached.phone,
    }).catch((auditErr) => console.error('[lookup] audit yozib bo\'lmadi:', auditErr.message));
    return fromCacheRow(cleanQuery, cached);
  }

  // `provider` berilsa (dashboard'dagi "Faqat Telegram"/"Faqat bot" tanlovi)
  // zanjir shu bittasiga cheklanadi; berilmasa yoki 'auto' bo'lsa standart
  // to'liq zanjir ishlatiladi.
  const chain = provider && provider !== 'auto' ? [provider] : config.lookup.providerChain;
  let finalResult = null;

  for (const providerName of chain) {
    const fn = PROVIDERS[providerName];
    if (!fn) continue;

    let result;
    try {
      result = await fn(cleanQuery);
    } catch (err) {
      console.warn(`[lookup] "${providerName}" provayderi xato: ${err.message}`);
      await record({ query: cleanQuery, provider: providerName, found: false, actor, purpose, phone: null }).catch(
        (auditErr) => console.error('[lookup] audit yozib bo\'lmadi:', auditErr.message)
      );
      continue;
    }

    await record({
      query: cleanQuery,
      provider: result.provider,
      found: result.found,
      actor,
      purpose,
      phone: result.phone,
    }).catch((auditErr) => console.error('[lookup] audit yozib bo\'lmadi:', auditErr.message));

    finalResult = result;
    // Birinchi topgan provider natijasi qaytariladi, qolganlari chaqirilmaydi.
    if (result.found) break;
  }

  if (!finalResult) {
    return { ...EMPTY_RESULT };
  }

  await cache.put(cleanQuery, finalResult);
  return { ...EMPTY_RESULT, ...finalResult, fromCache: false };
}

const STOP_CODES = ['LOOKUP_DAILY_CAP', 'LOOKUP_SUBSCRIPTION_REQUIRED', 'LOOKUP_QUOTA_EXHAUSTED'];

// Avval har iteratsiyada butun `results` massivi JobRun.params_json'ga QAYTA
// YOZILARDI — 5000 tagacha so'rov ruxsat etilgani uchun bu O(n^2) DB yozuv
// hajmiga olib kelardi (n-chi qadamda n ta elementli JSON qayta yoziladi).
// Endi har natija LookupJobResult'ga bitta INSERT bilan (append, hech qachon
// qayta yozilmaydi) qo'shiladi, JobRun esa faqat kichik, DOIMIY hajmdagi
// sanoq maydonlarini (done/ok_count/failed_count) yangilaydi — har
// iteratsiya O(1), jami ish O(n).
async function runBulk(queries, { purpose, actor, provider }, job) {
  const providerCounts = {};
  let done = 0;
  let ok = 0;
  let failed = 0;

  try {
    for (const query of queries) {
      try {
        const result = await resolve(query, { purpose, actor, provider });
        await LookupJobResult.create({
          job_id: job.id,
          query,
          found: result.found,
          phone: result.phone,
          provider: result.provider,
          confidence: result.confidence,
          first_name: result.first_name,
          last_name: result.last_name,
        });
        const key = result.provider || 'none';
        providerCounts[key] = (providerCounts[key] || 0) + 1;
        if (result.found) ok += 1;
      } catch (err) {
        await LookupJobResult.create({
          job_id: job.id,
          query,
          found: false,
          error_message: err.message,
          error_code: err.code || null,
        });
        failed += 1;
        // Kunlik cap/obuna/limit kabi "butun ishni to'xtatish" xatolari —
        // qolgan so'rovlarni ham urinib, hammasini "xato" bilan
        // to'ldirishning ma'nosi yo'q.
        if (STOP_CODES.includes(err.code)) {
          done += 1;
          await job.update({ done, ok_count: ok, failed_count: failed });
          break;
        }
      }
      done += 1;
      await job.update({ done, ok_count: ok, failed_count: failed });
    }
    await job.update({
      status: 'completed',
      params_json: { ...job.params_json, provider_counts: providerCounts },
    });
  } catch (err) {
    await job.update({ status: 'failed', error_message: err.message });
  }
}

/**
 * Ko'plab so'rovni ketma-ket qayta ishlaydi (fon rejimida). JobRun
 * (kind='lookup_bulk') darhol yaratiladi va id'si qaytadi — pipeline/scan/
 * folders/dialogs modullaridagi bilan bir xil "start + poll" naqshi.
 */
export async function resolveBulk(queries, { purpose, actor = 'api', provider } = {}) {
  const job = await JobRun.create({
    kind: 'lookup_bulk',
    status: 'running',
    total: queries.length,
    params_json: { purpose },
  });

  const donePromise = runBulk(queries, { purpose, actor, provider }, job);

  return { jobId: job.id, donePromise };
}

export default { resolve, resolveBulk };
