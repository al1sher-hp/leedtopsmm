import { Op } from 'sequelize';
import { DialogContact, Folder, JobRun } from '../db/models.js';
import { getAccountLimits, splitToLimit } from './limits.js';
import { setFolderPeers } from './client.js';
import { syncMembers } from './sync.js';
import { getPool } from '../telegram/client.js';

const ORDER_FIELDS = { premium_mentions: 'premium_mentions', last_message_at: 'last_message_at' };
const DEFAULT_ORDER_FIELD = 'premium_mentions';

// Qoida (`rule_json`) formati:
//   { premium_mentions_gte?, is_premium?, has_phone?, last_message_after?,
//     limit?, order_by?: 'premium_mentions' | 'last_message_at' }
//
// Qoidani DialogContact so'rovi uchun Sequelize `where`/`order`/`limit`ga
// aylantiradigan SOF funksiya — DB'ga ulanmasdan sinaladi (routes.js dagi
// buildWhere bilan bir xil naqsh). `opted_out=true` yozuvlar BUTUNLAY
// chetlab o'tiladi — bu shart qoidadan qat'i nazar doim qo'shiladi va
// hech qanday rule maydoni bilan bekor qilinmaydi.
export function buildDialogContactQuery(rule = {}) {
  const where = { opted_out: false };

  if (rule.premium_mentions_gte != null) {
    where.premium_mentions = { [Op.gte]: rule.premium_mentions_gte };
  }
  if (rule.is_premium != null) {
    where.is_premium = rule.is_premium;
  }
  if (rule.has_phone === true) {
    where.phone = { [Op.ne]: null };
  } else if (rule.has_phone === false) {
    where.phone = null;
  }
  if (rule.last_message_after) {
    where.last_message_at = { [Op.gte]: new Date(rule.last_message_after) };
  }

  const orderField = ORDER_FIELDS[rule.order_by] || DEFAULT_ORDER_FIELD;
  const query = { where, order: [[orderField, 'DESC']] };
  if (rule.limit) query.limit = rule.limit;
  return query;
}

export async function resolveRule(rule) {
  return DialogContact.findAll(buildDialogContactQuery(rule));
}

async function runApplyRule(folder, job) {
  try {
    const matches = await resolveRule(folder.rule_json);
    const pool = await getPool();
    const limits = await getAccountLimits(pool);
    const { fit, overflow } = splitToLimit(matches, limits);

    await setFolderPeers(pool, folder.tg_filter_id, fit.map((c) => c.tg_user_id));
    await syncMembers(folder.id);
    // overflow soni va qo'llangan qoidaning nusxasi shu yerda saqlanadi —
    // GET /api/folders har jild uchun resolveRule()ni qayta ishga
    // tushirmasdan (N+1 so'rov) shundan o'qiydi.
    await folder.update({
      last_synced_at: new Date(),
      last_overflow_count: overflow.length,
      last_applied_rule_json: folder.rule_json,
    });

    await job.update({
      status: 'completed',
      total: matches.length,
      done: matches.length,
      ok_count: fit.length,
      failed_count: 0,
      params_json: { ...job.params_json, overflow_count: overflow.length },
    });
  } catch (err) {
    console.error(`[folders] #${folder.id} qoidasini qo'llashda xato:`, err);
    await job.update({ status: 'failed', error_message: err.message });
  }
}

// Qoidani jildga qo'llaydi: mos keluvchilarni topadi, akkaunt limitidan
// oshib ketgan qismini kesib (lekin JIMGINA emas — natija `overflow_count`
// orqali aniq ko'rinadi) Telegram jildiga yozadi, so'ng FolderMember'ni
// Telegram'dagi haqiqiy holatga moslashtiradi.
//
// Og'ir Telegram ishi FON REJIMIDA ishlaydi (pipeline/scan bilan bir xil
// "start + poll" naqshi) — JobRun darhol yaratiladi va uning id'si qaytadi,
// chaqiruvchi (masalan API route) holatni keyinroq shu JobRun orqali
// kuzatishi mumkin. Faqat validatsiya xatolari (jild topilmadi, qoida yo'q)
// darhol (sinxron) tashlanadi.
export async function applyRule(folderId) {
  const folder = await Folder.findByPk(folderId);
  if (!folder) throw new Error('Jild topilmadi');
  if (!folder.tg_filter_id) {
    throw new Error("Jild hali Telegram'da yaratilmagan — avval yarating yoki sinxronlang");
  }
  if (!folder.rule_json) {
    throw new Error('Jildda qoida (rule) belgilanmagan');
  }

  const job = await JobRun.create({
    kind: 'folder_apply',
    status: 'running',
    params_json: { folderId: folder.id, rule: folder.rule_json },
  });

  const donePromise = runApplyRule(folder, job);

  return { jobId: job.id, donePromise };
}

export default { buildDialogContactQuery, resolveRule, applyRule };
