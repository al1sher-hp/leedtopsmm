import { pathToFileURL } from 'url';
import sequelize from '../db/index.js';
import { Lead, PipelineRun, PipelineRunLead } from '../db/models.js';
import { closeStalePipelineRuns } from '../db/staleRuns.js';
import { runDiscovery } from '../discovery/discovery.js';
import { enrichCandidate } from '../enrich/enrich.js';
import { scoreLead } from '../score/gemini.js';
import { disconnectPool } from '../telegram/client.js';
import { pipelineCancellation } from './cancellation.js';

function runCounts(stats) {
  return {
    created_count: stats.created,
    updated_count: stats.updated,
    skipped_count: stats.skipped,
    failed_count: stats.failed,
    blacklisted_count: stats.blacklisted,
  };
}

async function processCandidate(candidate, stats, runId) {
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
    let enriched;
    try {
      enriched = await enrichCandidate(candidate);
    } catch (err) {
      if (err.isBlacklisted) {
        stats.blacklisted += 1;
        console.log(`[pipeline] qora ro'yxatda, o'tkazib yuborildi: ${candidate.title}`);
        return;
      }
      throw err;
    }

    console.log(`[pipeline] baholanmoqda: ${candidate.title}`);
    const scored = await scoreLead(enriched);

    const { contact_confidence, ...scoreFields } = scored;
    const record = { ...enriched, ...scoreFields };

    let lead;
    let action;
    if (existing) {
      await existing.update(record);
      lead = existing;
      action = 'updated';
      stats.updated += 1;
    } else {
      lead = await Lead.create(record);
      action = 'created';
      stats.created += 1;
    }

    // Lead — mutabil yagona yozuv, shuning uchun (ScanResult'dan farqli)
    // to'g'ridan-to'g'ri emas, shu bog'lovchi jadval orqali "qaysi
    // yugurish(lar) uni yaratdi/yangiladi" qayd etiladi — bitta lead bir
    // necha pipeline yugurishining "papkasi"ga tegishli bo'lishi mumkin.
    await PipelineRunLead.create({ pipeline_run_id: runId, lead_id: lead.id, action });

    console.log(
      `[pipeline] saqlandi: ${candidate.title} | segment=${record.segment} score=${record.gemini_score} contact_type=${record.contact_type}`
    );
  } catch (err) {
    stats.failed += 1;
    console.error(`[pipeline] "${candidate.title}" uchun xato: ${err.message}`);
  }
}

/**
 * discovery -> enrich -> score -> store. To'xtab qolsa, qayta ishga tushirish
 * xavfsiz (idempotent). `keywords` berilmasa, discovery config/seeds.js'dagi
 * standart ro'yxatga tushadi (npm run pipeline uchun).
 */
export async function runPipeline({ keywords } = {}) {
  await sequelize.authenticate();
  pipelineCancellation.reset();
  console.log('[pipeline] boshlanmoqda...');

  // Har ehtimolga qarshi — server startida ham chaqiriladi, lekin bu yerda
  // ham qo'shimcha xavfsizlik qatlami sifatida.
  await closeStalePipelineRuns().catch((err) => console.error('[pipeline] osilib qolgan run tozalash xatosi:', err.message));

  const stats = { created: 0, updated: 0, skipped: 0, failed: 0, blacklisted: 0, cancelled: false };

  const run = await PipelineRun.create({
    keywords: keywords && keywords.length > 0 ? keywords.join(', ') : null,
    status: 'running',
  });

  try {
    let candidates;
    try {
      candidates = await runDiscovery({ keywords });
    } catch (err) {
      if (err.isCancellation) {
        console.log("[pipeline] discovery bosqichida foydalanuvchi tomonidan to'xtatildi");
        stats.cancelled = true;
        await run.update({ status: 'cancelled', ...runCounts(stats) });
        return { ...stats, runId: run.id };
      }
      throw err;
    }

    console.log(`[pipeline] ${candidates.length} ta nomzod topildi, boyitish/baholash boshlanmoqda...`);

    for (let i = 0; i < candidates.length; i++) {
      if (pipelineCancellation.isCancelled) {
        console.log("[pipeline] foydalanuvchi tomonidan to'xtatildi");
        stats.cancelled = true;
        break;
      }
      console.log(`[pipeline] (${i + 1}/${candidates.length})`);
      await processCandidate(candidates[i], stats, run.id);
    }

    console.log('[pipeline] tugadi:', stats);
    await run.update({ status: stats.cancelled ? 'cancelled' : 'completed', ...runCounts(stats) });
    return { ...stats, runId: run.id };
  } catch (err) {
    await run.update({ status: 'failed', error_message: err.message, ...runCounts(stats) });
    throw err;
  }
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
