// src/api/lookupRoutes.js
// Nomer topish (lookup) provider zanjiri uchun API — DIQQAT:
// docs/DATA-RISK.md'ni albatta o'qing (tashqi bot snapshot bazadan javob
// beradi, real vaqt emas).

import { Router } from 'express';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { JobRun, LookupAudit, LookupJobResult } from '../db/models.js';
import { resolve, resolveBulk } from '../lookup/index.js';
import { botState } from '../lookup/providers/tgbot.js';
import config from '../config/index.js';

const router = Router();

function statusForError(err) {
  if (err.code && (err.code.startsWith('LOOKUP_') || err.code === 'GRAMJS_NO_ACCOUNT')) return 400;
  return 500;
}

// POST /api/lookup/resolve  { query, purpose?, provider? }
// `provider` — 'auto' (standart, to'liq zanjir) | 'gramjs' | 'tgbot'
// (dashboard'dagi "Auto / Faqat Telegram / Faqat bot" tanloviga mos).
router.post('/resolve', async (req, res) => {
  try {
    const { query, purpose, provider } = req.body || {};
    if (!query?.trim()) return res.status(400).json({ error: 'query majburiy' });

    const result = await resolve(query.trim(), { purpose, actor: 'api', provider });
    res.json({ data: result });
  } catch (err) {
    console.error('[lookup] POST /resolve xato:', err);
    res.status(statusForError(err)).json({ error: err.message, code: err.code });
  }
});

// POST /api/lookup/bulk  { queries[], purpose?, provider? } -> background, job_id
router.post('/bulk', async (req, res) => {
  try {
    const { queries, purpose, provider } = req.body || {};
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: 'queries array majburiy' });
    }
    if (queries.length > 5000) {
      return res.status(400).json({ error: "Bir vaqtda maksimal 5000 ta so'rov" });
    }

    const { jobId, donePromise } = await resolveBulk(queries, { purpose, actor: 'api', provider });
    donePromise.catch((err) => console.error('[lookup] bulk xatosi:', err));

    res.status(202).json({ message: 'Bulk lookup boshlandi', job_id: jobId });
  } catch (err) {
    console.error('[lookup] POST /bulk xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// GET /api/lookup/jobs/:id?page=&limit= — progress + provider taqsimoti +
// sahifalangan natijalar (LookupJobResult'dan — endi JobRun.params_json
// ichida emas, qarang: runBulk() izohi src/lookup/index.js'da).
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await JobRun.findByPk(req.params.id);
    if (!job || job.kind !== 'lookup_bulk') return res.status(404).json({ error: 'Job topilmadi' });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const offset = (page - 1) * limit;

    const { rows, count } = await LookupJobResult.findAndCountAll({
      where: { job_id: job.id },
      order: [['id', 'ASC']],
      limit,
      offset,
    });

    res.json({
      data: job,
      provider_counts: job.params_json?.provider_counts || {},
      results: rows,
      results_pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error('[lookup] GET /jobs/:id xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/jobs/:id/export.xlsx', async (req, res) => {
  try {
    const job = await JobRun.findByPk(req.params.id);
    if (!job || job.kind !== 'lookup_bulk') return res.status(404).json({ error: 'Job topilmadi' });

    const results = await LookupJobResult.findAll({ where: { job_id: job.id }, order: [['id', 'ASC']] });
    const rows = results.map((r) => ({
      Query: r.query,
      Topildi: r.found ? 'Ha' : "Yo'q",
      Telefon: r.phone || '',
      Ism: [r.first_name, r.last_name].filter(Boolean).join(' '),
      Provider: r.provider || '',
      Ishonchlilik: r.confidence === 'verified' ? 'Tasdiqlangan' : r.confidence === 'unverified' ? 'Tasdiqlanmagan' : '',
      Xato: r.error_message || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 16 }, { wch: 25 }, { wch: 10 }, { wch: 16 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Lookup natijalari');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="lookup-${job.id}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('[lookup] export.xlsx xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/lookup/providers — bot holati, kunlik qoldiq, oxirgi xato
router.get('/providers', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // guard.js dagi countToday() bilan bir xil hisob — faqat haqiqiy tashqi
    // (tgbot) so'rovlari kunlik cap'ga ta'sir qiladi, shu yerda ham xuddi
    // shu ta'rif ko'rsatiladi (aks holda UI'dagi son cap'ni belgilaydigan
    // haqiqiy sondan farqli bo'lib qolardi).
    const usedToday = await LookupAudit.count({
      where: { createdAt: { [Op.gte]: startOfDay }, provider: 'tgbot' },
    });

    res.json({
      chain: config.lookup.providerChain,
      dailyCap: config.lookup.dailyCap,
      usedToday,
      remainingToday: Math.max(0, config.lookup.dailyCap - usedToday),
      bot: { ...botState },
    });
  } catch (err) {
    console.error('[lookup] GET /providers xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/lookup/audit?provider=&actor=&date_from=&date_to=&page=&limit=
router.get('/audit', async (req, res) => {
  try {
    const { provider, actor, date_from, date_to } = req.query;
    const where = {};
    if (provider) where.provider = provider;
    if (actor) where.actor = actor;
    if (date_from || date_to) {
      where.createdAt = {};
      if (date_from) where.createdAt[Op.gte] = new Date(date_from);
      if (date_to) where.createdAt[Op.lte] = new Date(date_to);
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { rows, count } = await LookupAudit.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({ data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } });
  } catch (err) {
    console.error('[lookup] GET /audit xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

export default router;
