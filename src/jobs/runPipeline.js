import { pathToFileURL } from 'url';
import sequelize from '../db/index.js';
import { Lead } from '../db/models.js';
import { runDiscovery } from '../discovery/discovery.js';
import { enrichCandidate } from '../enrich/enrich.js';
import { scoreLead } from '../score/gemini.js';
import { disconnectPool } from '../telegram/client.js';

async function processCandidate(candidate, stats) {
  try {
    const existing = await Lead.findOne({ where: { channel_id: candidate.channel_id } });

    // Idempotentlik: gemini_score allaqachon mavjud bo'lsa (to'liq qayta
    // ishlangan), qayta boyitib/baholab vaqt/pul sarflamaymiz.
    if (existing && existing.gemini_score !== null) {
      stats.skipped += 1;
      console.log(`[pipeline] o'tkazib yuborildi (allaqachon qayta ishlangan): ${candidate.title}`);
      return;
    }

    console.log(`[pipeline] boyitilmoqda: ${candidate.title}`);
    const enriched = await enrichCandidate(candidate);

    console.log(`[pipeline] baholanmoqda: ${candidate.title}`);
    const scored = await scoreLead(enriched);

    const { contact_confidence, ...scoreFields } = scored;
    const record = { ...enriched, ...scoreFields };

    if (existing) {
      await existing.update(record);
      stats.updated += 1;
    } else {
      await Lead.create(record);
      stats.created += 1;
    }
    console.log(
      `[pipeline] saqlandi: ${candidate.title} | segment=${record.segment} score=${record.gemini_score} contact_type=${record.contact_type}`
    );
  } catch (err) {
    stats.failed += 1;
    console.error(`[pipeline] "${candidate.title}" uchun xato: ${err.message}`);
  }
}

/** discovery -> enrich -> score -> store. To'xtab qolsa, qayta ishga tushirish xavfsiz. */
export async function runPipeline() {
  await sequelize.authenticate();
  console.log('[pipeline] boshlanmoqda...');

  const candidates = await runDiscovery();
  console.log(`[pipeline] ${candidates.length} ta nomzod topildi, boyitish/baholash boshlanmoqda...`);

  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < candidates.length; i++) {
    console.log(`[pipeline] (${i + 1}/${candidates.length})`);
    await processCandidate(candidates[i], stats);
  }

  console.log('[pipeline] tugadi:', stats);
  return stats;
}

async function main() {
  try {
    await runPipeline();
  } catch (err) {
    console.error('[pipeline] jiddiy xato:', err);
  } finally {
    await disconnectPool();
    process.exit(0);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main();
}

export default { runPipeline };
