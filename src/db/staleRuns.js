import { Op } from 'sequelize';
import { PipelineRun } from './models.js';

// Jarayon (server/pipeline) o'rtada qulasa, PipelineRun abadiy
// status:'running' qolib ketishi mumkin edi — bunday "osilib qolgan"
// yugurishlarni topib, avtomatik yopadi.
const STALE_RUN_TIMEOUT_MS = 30 * 60_000;

export async function closeStalePipelineRuns() {
  const cutoff = new Date(Date.now() - STALE_RUN_TIMEOUT_MS);
  const [count] = await PipelineRun.update(
    { status: 'failed', error_message: 'Osilib qolgan run avtomatik yopildi' },
    { where: { status: 'running', updatedAt: { [Op.lt]: cutoff } } }
  );
  if (count > 0) {
    console.warn(`[pipeline] ${count} ta osilib qolgan run "failed" holatiga o'tkazildi`);
  }
  return count;
}

// Eslatma: ScanSession uchun bu kerak emas — ScanResult sessiyasi faqat
// skanerlash tugagach (muvaffaqiyat/bekor qilish/xato — barcha yo'llarda)
// yaratiladi (qarang: src/jobs/runChannelScan.js), shuning uchun DB'da hech
// qachon "running" holatida osilib qolmaydi (jarayon qulasa, hech narsa
// yozilmagan bo'ladi, keyingi skanerlash bunga bog'liq emas).

export default { closeStalePipelineRuns };
