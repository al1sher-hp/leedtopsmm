// src/api/dialogRoutes.js
// Userbot'ning lichka (shaxsiy) dialoglarini CRM sifatida ko'rsatish va
// sinxronlash.

import { Router } from 'express';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { DialogContact, FolderMember, JobRun } from '../db/models.js';

const router = Router();

const SORTABLE_FIELDS = new Set([
  'premium_mentions', 'last_message_at', 'message_count', 'createdAt', 'first_name', 'username',
]);

// routes.js dagi buildWhere bilan bir xil naqsh — DB'siz sinaladigan sof
// funksiya, so'rov query'sini Sequelize `where` obyektiga aylantiradi.
export function buildWhere(query) {
  const where = {};
  const { has_phone, is_premium, is_bot, opted_out, premium_mentions_gte, q } = query;

  if (has_phone === 'true') where.phone = { [Op.ne]: null };
  if (has_phone === 'false') where.phone = null;

  if (is_premium === 'true') where.is_premium = true;
  if (is_premium === 'false') where.is_premium = false;

  if (is_bot === 'true') where.is_bot = true;
  if (is_bot === 'false') where.is_bot = false;

  if (opted_out === 'true') where.opted_out = true;
  if (opted_out === 'false') where.opted_out = false;

  if (premium_mentions_gte) {
    const n = parseInt(premium_mentions_gte, 10);
    if (Number.isFinite(n)) where.premium_mentions = { [Op.gte]: n };
  }

  if (q) {
    const terms = q.split(',').map((t) => t.trim()).filter(Boolean);
    if (terms.length > 0) {
      where[Op.or] = terms.flatMap((term) => [
        { first_name: { [Op.iLike]: `%${term}%` } },
        { last_name: { [Op.iLike]: `%${term}%` } },
        { username: { [Op.iLike]: `%${term}%` } },
      ]);
    }
  }

  return where;
}

export function buildOrder(sortParam) {
  const [fieldRaw, dirRaw] = (sortParam || 'premium_mentions desc').trim().split(/\s+/);
  const field = SORTABLE_FIELDS.has(fieldRaw) ? fieldRaw : 'premium_mentions';
  const dir = (dirRaw || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return [[field, dir]];
}

// "folder" filtri DialogContact'ning o'z ustuni emas — FolderMember orqali
// bog'langan, shuning uchun `buildWhere`dan alohida (DB so'rovi kerak).
async function applyFolderFilter(where, folderId) {
  if (!folderId) return where;
  const members = await FolderMember.findAll({ where: { folder_id: folderId }, attributes: ['tg_user_id'] });
  const ids = members.map((m) => m.tg_user_id);
  // Bo'sh massiv Op.in'ga berilsa Sequelize "hech narsaga mos kelmasin"
  // o'rniga bo'sh WHERE IN () xatosiga olib kelishi mumkin — shuning uchun
  // hech qachon mos kelmaydigan bitta soxta qiymat bilan almashtiriladi.
  return { ...where, tg_user_id: { [Op.in]: ids.length > 0 ? ids : [''] } };
}

router.get('/', async (req, res) => {
  try {
    let where = buildWhere(req.query);
    where = await applyFolderFilter(where, req.query.folder);
    const order = buildOrder(req.query.sort);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
    const offset = (page - 1) * limit;

    const { rows, count } = await DialogContact.findAndCountAll({ where, order, limit, offset });
    res.json({
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error('[dialogs] GET / xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Body'dan FAQAT `opted_out`ni ajratib oladigan sof funksiya — boshqa har
// qanday maydon (masalan status, phone) shu yerda allaqachon e'tiborsiz
// qoldiriladi, route esa faqat natijani qo'llaydi. DB'siz sinaladi.
export function pickOptedOutUpdate(body) {
  if (!body || typeof body.opted_out !== 'boolean') return null;
  return { opted_out: body.opted_out };
}

// PATCH /api/dialogs/:id  { opted_out: boolean } — FAQAT shu maydon
// o'zgartiriladi, boshqa har qanday body maydoni e'tiborsiz qoldiriladi.
router.patch('/:id', async (req, res) => {
  try {
    const update = pickOptedOutUpdate(req.body);
    if (!update) {
      return res.status(400).json({ error: 'opted_out (boolean) majburiy' });
    }

    const contact = await DialogContact.findByPk(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Kontakt topilmadi' });

    await contact.update(update);

    res.json({ data: contact });
  } catch (err) {
    console.error('[dialogs] PATCH /:id xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/export.xlsx', async (req, res) => {
  try {
    let where = buildWhere(req.query);
    where = await applyFolderFilter(where, req.query.folder);
    const order = buildOrder(req.query.sort);
    const rows = await DialogContact.findAll({ where, order });

    const data = rows.map((r) => ({
      ID: r.tg_user_id,
      Ism: [r.first_name, r.last_name].filter(Boolean).join(' '),
      Username: r.username ? `@${r.username}` : '',
      Telefon: r.phone || '',
      'Telefon manbasi': r.phone_source || '',
      Premium: r.is_premium ? 'Ha' : "Yo'q",
      'Oxirgi xabar': r.last_message_at ? new Date(r.last_message_at).toLocaleString('uz') : '',
      'Premium eslatishlar soni': r.premium_mentions,
      "Chiqarilgan (opted_out)": r.opted_out ? 'Ha' : "Yo'q",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 25 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Kontaktlar');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="dialog-contacts.xlsx"');
    res.send(buf);
  } catch (err) {
    console.error('[dialogs] export.xlsx xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Sinxronizatsiya bir vaqtda faqat bitta bo'lishi mumkin — pipeline/scan
// bilan bir xil sodda in-memory bayroq (bitta API instansiyasi uchun yetarli).
let dialogsSyncRunning = false;

router.post('/sync', async (req, res) => {
  // Doimiy MTProto ulanish (getPool()) talab qiladi — pipeline/scan bilan
  // bir xil sababga ko'ra Vercel serverless'da ishlamaydi.
  if (process.env.VERCEL) {
    return res.status(501).json({
      error: "Dialoglar sinxronizatsiyasi Vercel serverless funksiyasida ishlamaydi (doimiy Telegram ulanishi kerak).",
    });
  }
  if (dialogsSyncRunning) {
    return res.status(409).json({ error: 'Sinxronizatsiya allaqachon ishlamoqda' });
  }

  try {
    const { limit, since } = req.body || {};
    const { syncDialogs } = await import('../dialogs/sync.js');

    dialogsSyncRunning = true;
    const { jobId, donePromise } = await syncDialogs({ limit: limit || undefined, since: since || undefined });
    donePromise.catch((err) => console.error('[dialogs] sync xatosi:', err)).finally(() => {
      dialogsSyncRunning = false;
    });

    res.status(202).json({ message: 'Sinxronizatsiya boshlandi', job_id: jobId });
  } catch (err) {
    dialogsSyncRunning = false;
    console.error('[dialogs] POST /sync xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

router.post('/sync/cancel', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "Bekor qilish Vercel serverless funksiyasida ishlamaydi." });
  }
  if (!dialogsSyncRunning) {
    return res.status(409).json({ error: 'Hech qanday sinxronizatsiya hozir ishlamayapti' });
  }

  const { dialogsSyncCancellation } = await import('../jobs/dialogsSyncCancellation.js');
  dialogsSyncCancellation.cancel();

  res.status(202).json({ message: "To'xtatish so'rovi yuborildi, bir necha soniyada to'xtaydi" });
});

// Alohida holat obyekti saqlash o'rniga oxirgi JobRun (kind='dialogs_sync')
// to'g'ridan-to'g'ri DB'dan o'qiladi — progress allaqachon shu yerda,
// server qayta ishga tushsa ham yo'qolmaydi.
router.get('/sync/status', async (req, res) => {
  try {
    const job = await JobRun.findOne({ where: { kind: 'dialogs_sync' }, order: [['createdAt', 'DESC']] });
    res.json({ data: job, running: dialogsSyncRunning });
  } catch (err) {
    console.error('[dialogs] GET /sync/status xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ─── Klassifikatsiya: premium'ga qiziqish tahlili ───────────────────────────
let dialogsClassifyRunning = false;

// POST /api/dialogs/classify  { keywords?, threshold?, ai_verify?, message_limit?, dialog_limit? }
router.post('/classify', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({
      error: "Klassifikatsiya Vercel serverless funksiyasida ishlamaydi (doimiy Telegram ulanishi kerak).",
    });
  }
  if (dialogsClassifyRunning) {
    return res.status(409).json({ error: 'Klassifikatsiya allaqachon ishlamoqda' });
  }

  try {
    const { keywords, threshold, ai_verify, message_limit, dialog_limit } = req.body || {};
    const { classifyDialogs } = await import('../dialogs/classify.js');

    dialogsClassifyRunning = true;
    const { jobId, donePromise } = await classifyDialogs({
      keywords: Array.isArray(keywords) && keywords.length > 0 ? keywords : undefined,
      threshold: threshold || undefined,
      aiVerify: ai_verify === true,
      messageLimit: message_limit || undefined,
      dialogLimit: dialog_limit || undefined,
    });
    donePromise.catch((err) => console.error('[dialogs] classify xatosi:', err)).finally(() => {
      dialogsClassifyRunning = false;
    });

    res.status(202).json({ message: 'Klassifikatsiya boshlandi', job_id: jobId });
  } catch (err) {
    dialogsClassifyRunning = false;
    console.error('[dialogs] POST /classify xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

router.post('/classify/cancel', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "Bekor qilish Vercel serverless funksiyasida ishlamaydi." });
  }
  if (!dialogsClassifyRunning) {
    return res.status(409).json({ error: 'Hech qanday klassifikatsiya hozir ishlamayapti' });
  }

  const { dialogsClassifyCancellation } = await import('../jobs/dialogsClassifyCancellation.js');
  dialogsClassifyCancellation.cancel();

  res.status(202).json({ message: "To'xtatish so'rovi yuborildi, bir necha soniyada to'xtaydi" });
});

// GET /api/dialogs/classify/status — progress + ETA (JobRun.params_json.eta_seconds)
router.get('/classify/status', async (req, res) => {
  try {
    const job = await JobRun.findOne({ where: { kind: 'dialogs_classify' }, order: [['createdAt', 'DESC']] });
    res.json({ data: job, running: dialogsClassifyRunning });
  } catch (err) {
    console.error('[dialogs] GET /classify/status xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

export default router;
