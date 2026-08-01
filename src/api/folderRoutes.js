// src/api/folderRoutes.js
// Telegram jildlarini (Dialog Filter) boshqarish: 500 taga yaqin premium
// mijozni qoida bo'yicha ajratib, Telegram jildiga joylash.

import { Router } from 'express';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { Folder, FolderMember, DialogContact, JobRun } from '../db/models.js';
import { getPool } from '../telegram/client.js';
import { getAccountLimits, assertCanAddFolder, REGULAR_LIMITS } from '../folders/limits.js';
import { listFolders, ensureFolder, deleteFolder } from '../folders/client.js';
import { applyRule } from '../folders/rules.js';
import { syncMembers } from '../folders/sync.js';

const router = Router();

// Ikkala qoida (eski JSONB va yangi JSONB) teng ekanini tekshiradi — kalit
// tartibi farq qilishi mumkin bo'lgani uchun oddiy `===` yoki `JSON.stringify`
// solishtirish YETARLI EMAS (masalan `{a:1,b:2}` vs `{b:2,a:1}`). DB'siz
// sinaladigan sof funksiya — routes.js dagi buildWhere bilan bir xil naqsh.
export function rulesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

// GET /api/folders — DB'dagi jildlar + har biri uchun joriy limit/overflow
// hisobi. `overflow_count` endi HAR SO'ROVDA resolveRule()ni qayta ishga
// tushirmasdan (N+1 so'rov) — applyRule() so'nggi qo'llashda hisoblab,
// Folder.last_overflow_count'ga yozib qo'ygan qiymatdan o'qiladi. Joriy
// `rule_json` so'nggi qo'llangan (`last_applied_rule_json`) bilan mos
// kelmasa — `stale: true` (qoida o'zgargan/hali qo'llanmagan, ko'rsatilgan
// overflow_count eskirgan bo'lishi mumkin). Telegram limitini (premium/
// oddiy) aniqlab bo'lmasa (masalan Vercel'da doimiy ulanish yo'q), standart
// (oddiy akkaunt) limitlar bilan davom etiladi — bu sahifa har doim
// ochilishi kerak.
router.get('/', async (req, res) => {
  try {
    const folders = await Folder.findAll({ order: [['createdAt', 'ASC']] });

    let limits = REGULAR_LIMITS;
    if (!process.env.VERCEL) {
      try {
        const pool = await getPool();
        limits = await getAccountLimits(pool);
      } catch (err) {
        console.warn("[folders] limitlarni aniqlab bo'lmadi, standart (oddiy akkaunt) limitlar ko'rsatiladi:", err.message);
      }
    }

    const data = folders.map((folder) => {
      const overflow_count = folder.last_overflow_count || 0;
      const stale = Boolean(folder.rule_json) && !rulesEqual(folder.rule_json, folder.last_applied_rule_json);
      return {
        ...folder.toJSON(),
        limit: limits.maxPeersPerFolder,
        overflow_count,
        truncated: overflow_count > 0,
        stale,
      };
    });

    res.json({ data, limits });
  } catch (err) {
    console.error('[folders] GET / xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/folders  { title, emoticon?, rule? }
router.post('/', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({
      error: "Jild yaratish Vercel serverless funksiyasida ishlamaydi (doimiy Telegram ulanishi kerak).",
    });
  }
  try {
    const { title, emoticon, rule } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title majburiy' });

    const pool = await getPool();
    const limits = await getAccountLimits(pool);
    const remoteFolders = await listFolders(pool);
    const currentCount = remoteFolders.filter((f) => !f.isDefault).length;
    assertCanAddFolder(currentCount, limits);

    const { id: tg_filter_id } = await ensureFolder(pool, {
      title: title.trim(),
      emoticon: emoticon?.trim() || null,
    });

    const folder = await Folder.create({
      tg_filter_id,
      title: title.trim(),
      emoticon: emoticon?.trim() || null,
      managed_by_us: true,
      rule_json: rule || null,
      last_synced_at: new Date(),
    });

    res.json({ data: folder });
  } catch (err) {
    console.error('[folders] POST / xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// POST /api/folders/:id/apply — qoidani qo'llash (fon rejimda, job_id qaytaradi)
router.post('/:id/apply', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "Qoidani qo'llash Vercel serverless funksiyasida ishlamaydi." });
  }
  try {
    const folder = await Folder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Jild topilmadi' });

    const { jobId, donePromise } = await applyRule(folder.id);
    // Xato JobRun yozuvida saqlanadi (runApplyRule ichida) — bu yerda faqat
    // ushlanmagan promise rad etilishining oldini olamiz.
    donePromise.catch(() => {});

    res.status(202).json({ message: "Qoida qo'llanmoqda", job_id: jobId });
  } catch (err) {
    // Bu yerga faqat validatsiya xatolari (jild/qoida yo'q) yetib keladi —
    // og'ir Telegram ishi allaqachon fon rejimida.
    res.status(400).json({ error: err.message || 'Server xatosi' });
  }
});

// GET /api/folders/jobs/:jobId — apply() holatini kuzatish uchun
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await JobRun.findByPk(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job topilmadi' });
    res.json({ data: job });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/folders/:id/sync — Telegram'dan qayta o'qish
router.post('/:id/sync', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: 'Sinxronlash Vercel serverless funksiyasida ishlamaydi.' });
  }
  try {
    const folder = await Folder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Jild topilmadi' });

    const members = await syncMembers(folder.id);
    await folder.reload();
    res.json({ data: folder, members_count: members.length });
  } catch (err) {
    console.error('[folders] sync xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// A'zolarga tegishli DialogContact ma'lumotini (ism, username, telefon...)
// bitta so'rovda birlashtiradi — /members va /export.xlsx uchun umumiy.
async function decorateMembers(members) {
  const tgUserIds = members.map((m) => m.tg_user_id);
  const contacts = tgUserIds.length > 0
    ? await DialogContact.findAll({ where: { tg_user_id: { [Op.in]: tgUserIds } } })
    : [];
  const byId = Object.fromEntries(contacts.map((c) => [c.tg_user_id, c]));
  return members.map((m) => ({ member: m, contact: byId[m.tg_user_id] || null }));
}

// GET /api/folders/:id/members?page=&limit=
router.get('/:id/members', async (req, res) => {
  try {
    const folder = await Folder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Jild topilmadi' });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const offset = (page - 1) * limit;

    const { count, rows } = await FolderMember.findAndCountAll({
      where: { folder_id: folder.id },
      order: [['added_at', 'DESC']],
      limit,
      offset,
    });

    const decorated = await decorateMembers(rows);
    const data = decorated.map(({ member, contact }) => ({ ...member.toJSON(), contact }));

    res.json({ data, total: count, page });
  } catch (err) {
    console.error('[folders] GET /:id/members xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/folders/:id/export.xlsx
router.get('/:id/export.xlsx', async (req, res) => {
  try {
    const folder = await Folder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Jild topilmadi' });

    const members = await FolderMember.findAll({
      where: { folder_id: folder.id },
      order: [['added_at', 'DESC']],
    });
    const decorated = await decorateMembers(members);

    const rows = decorated.map(({ member, contact }) => ({
      ID: member.tg_user_id,
      Ism: [contact?.first_name, contact?.last_name].filter(Boolean).join(' '),
      Username: contact?.username ? `@${contact.username}` : '',
      Telefon: contact?.phone || '',
      Premium: contact?.is_premium ? 'Ha' : "Yo'q",
      'Oxirgi xabar': contact?.last_message_at ? new Date(contact.last_message_at).toLocaleString('uz') : '',
      'Premium eslatishlar soni': contact?.premium_mentions ?? 0,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Jild a'zolari");

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeTitle = (folder.title || 'azolar').replace(/[^a-z0-9]+/gi, '-');
    const filename = `folder-${folder.id}-${safeTitle}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('[folders] export.xlsx xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// DELETE /api/folders/:id — FAQAT managed_by_us=true bo'lsa
router.delete('/:id', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "O'chirish Vercel serverless funksiyasida ishlamaydi." });
  }
  try {
    const folder = await Folder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Jild topilmadi' });
    if (!folder.managed_by_us) {
      return res.status(403).json({
        error: "Faqat tizim tomonidan yaratilgan (managed_by_us) jildlarni o'chirish mumkin",
      });
    }

    if (folder.tg_filter_id) {
      const pool = await getPool();
      await deleteFolder(pool, folder.tg_filter_id);
    }

    await FolderMember.destroy({ where: { folder_id: folder.id } });
    await folder.destroy();

    res.json({ deleted: true });
  } catch (err) {
    console.error('[folders] DELETE xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

export default router;
