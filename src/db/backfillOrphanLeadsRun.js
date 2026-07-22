// Bir martalik backfill: PipelineRun/PipelineRunLead qo'shilishidan OLDIN
// (yoki boshqa yo'l bilan) yig'ilgan lead'lar hech qanday yugurishga
// bog'lanmagan ("orphan") bo'lib qoladi — natijada ular Lead'lar bo'limining
// o'ng panelida (papkalar) hech qayerda ko'rinmaydi. Bu skript ularning
// barchasini bitta "Eski lead'lar (import)" papkasiga bog'laydi.
//
// Idempotent: har ishga tushirilganda faqat O'SHA PAYTDA hali biror
// PipelineRunLead'ga bog'lanmagan lead'larni qidiradi — qayta ishga
// tushirilganda (hammasi allaqachon bog'langan bo'lsa) hech narsa qilmaydi,
// dublikat yaratmaydi.
//
// Ishga tushirish: npm run backfill:runs
import sequelize from './index.js';
import { PipelineRun, PipelineRunLead } from './models.js';

const IMPORT_RUN_KEYWORDS = "Eski lead'lar (import)";

async function backfillOrphanLeadsRun() {
  try {
    await sequelize.authenticate();
    console.log('[backfill:runs] DB ulanishi OK');

    const [orphanRows] = await sequelize.query(`
      SELECT l.id FROM leads l
      WHERE NOT EXISTS (SELECT 1 FROM pipeline_run_leads prl WHERE prl.lead_id = l.id)
    `);

    if (orphanRows.length === 0) {
      console.log("[backfill:runs] Guruhlanmagan lead topilmadi — hech narsa qilinmadi.");
      process.exit(0);
    }

    const run = await PipelineRun.create({
      keywords: IMPORT_RUN_KEYWORDS,
      status: 'completed',
      created_count: orphanRows.length,
    });

    await PipelineRunLead.bulkCreate(
      orphanRows.map((row) => ({ pipeline_run_id: run.id, lead_id: row.id, action: 'created' }))
    );

    console.log(
      `[backfill:runs] ${orphanRows.length} ta lead "#${run.id} ${IMPORT_RUN_KEYWORDS}" papkasiga bog'landi.`
    );
    process.exit(0);
  } catch (err) {
    console.error('[backfill:runs] Xato:', err);
    process.exit(1);
  }
}

backfillOrphanLeadsRun();
