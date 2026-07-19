import { Router } from 'express';
import { Op } from 'sequelize';
import { Lead } from '../db/models.js';

const router = Router();

router.get('/health', (req, res) => res.json({ ok: true }));

const SORTABLE_FIELDS = new Set(['gemini_score', 'subs', 'createdAt', 'updatedAt', 'channel_title', 'id']);
const VALID_STATUSES = ['new', 'contacted', 'replied', 'client', 'rejected'];

function buildWhere(query) {
  const where = {};
  const { segment, contact_type, has_phone, status, category, lang, q } = query;

  if (segment) where.segment = segment;
  if (contact_type) where.contact_type = contact_type;
  if (status) where.status = status;
  if (category) where.category = category;
  if (lang) where.lang = lang;

  if (has_phone === 'true') where.phone = { [Op.ne]: null };
  if (has_phone === 'false') where.phone = null;

  if (q) {
    // Vergul bilan ajratilgan bir nechta so'z kiritilsa, ularning istalgan
    // biri istalgan maydonda topilgan lead'lar qaytariladi (OR mantiq).
    const terms = q
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length > 0) {
      where[Op.or] = terms.flatMap((term) => [
        { channel_title: { [Op.iLike]: `%${term}%` } },
        { channel_username: { [Op.iLike]: `%${term}%` } },
        { contact_username: { [Op.iLike]: `%${term}%` } },
        { description: { [Op.iLike]: `%${term}%` } },
      ]);
    }
  }

  return where;
}

function buildOrder(sortParam) {
  const [fieldRaw, dirRaw] = (sortParam || 'gemini_score desc').trim().split(/\s+/);
  const field = SORTABLE_FIELDS.has(fieldRaw) ? fieldRaw : 'gemini_score';
  const dir = (dirRaw || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return [[field, dir]];
}

router.get('/leads', async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const order = buildOrder(req.query.sort);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
    const offset = (page - 1) * limit;

    const { rows, count } = await Lead.findAndCountAll({ where, order, limit, offset });

    res.json({
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error('[api] GET /leads xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.patch('/leads/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status quyidagilardan biri bo'lishi kerak: ${VALID_STATUSES.join(', ')}` });
    }

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead topilmadi' });

    lead.status = status;
    await lead.save();
    res.json({ data: lead });
  } catch (err) {
    console.error('[api] PATCH /leads/:id xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await Lead.count();
    const withPhone = await Lead.count({ where: { phone: { [Op.ne]: null } } });
    const withUsername = await Lead.count({ where: { contact_username: { [Op.ne]: null } } });

    const segmentRows = await Lead.findAll({
      attributes: ['segment', [Lead.sequelize.fn('COUNT', Lead.sequelize.col('id')), 'count']],
      group: ['segment'],
      raw: true,
    });
    const statusRows = await Lead.findAll({
      attributes: ['status', [Lead.sequelize.fn('COUNT', Lead.sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true,
    });

    const bySegment = Object.fromEntries(segmentRows.map((r) => [r.segment || 'unscored', parseInt(r.count, 10)]));
    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, parseInt(r.count, 10)]));

    res.json({ total, withPhone, withUsername, bySegment, byStatus });
  } catch (err) {
    console.error('[api] GET /stats xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get('/leads/export.csv', async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const order = buildOrder(req.query.sort);
    const leads = await Lead.findAll({ where, order });

    const columns = [
      'id', 'channel_title', 'channel_username', 'channel_id', 'type', 'subs',
      'category', 'lang', 'phone', 'contact_username', 'contact_type', 'source',
      'gemini_score', 'segment', 'score_reason', 'status', 'createdAt',
    ];

    const headerLine = columns.join(',');
    const lines = leads.map((lead) => columns.map((col) => toCsvValue(lead[col])).join(','));
    const csv = [headerLine, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    // BOM — Excel'da UZ/RU harflar to'g'ri ko'rinishi uchun
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[api] GET /leads/export.csv xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Pipeline'ni background'da ishga tushirish + holatini kuzatish uchun sodda
// xotiradagi state (bitta API instansiyasi uchun yetarli).
const pipelineState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastStats: null,
  lastError: null,
  keywords: null,
};

router.post('/pipeline/run', async (req, res) => {
  // Pipeline uzoq davom etadigan (ataylab rate-limited) va doimiy MTProto ulanish
  // talab qiladigan jarayon — Vercel'ning qisqa muddatli serverless funksiyalarida
  // ishlay olmaydi. Buni doim ishlaydigan hostda (Railway/Render/VPS) yoki lokal
  // `npm run pipeline` orqali ishga tushiring.
  if (process.env.VERCEL) {
    return res.status(501).json({
      error:
        "Pipeline Vercel serverless funksiyasida ishlamaydi (uzoq davom etadigan, doimiy ulanish talab qiladi). " +
        "'npm run pipeline'ni doim ishlaydigan hostda (Railway/Render/VPS) yoki lokal ishga tushiring.",
    });
  }

  if (pipelineState.running) {
    return res.status(409).json({ error: 'Pipeline allaqachon ishlamoqda', state: pipelineState });
  }

  // Kalit so'zsiz pipeline ishga tushmaydi — behuda (nimani qidirishni
  // bilmaydigan) ishlashning oldini oladi.
  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  if (keywords.length === 0) {
    return res.status(400).json({
      error: "Kalit so'zlar kiritilishi shart — kamida bitta so'z bering (masalan \"Toshkent\", \"biznes\").",
    });
  }

  pipelineState.running = true;
  pipelineState.startedAt = new Date().toISOString();
  pipelineState.finishedAt = null;
  pipelineState.lastError = null;
  pipelineState.keywords = keywords;

  const { runPipeline } = await import('../jobs/runPipeline.js');

  runPipeline({ keywords })
    .then((stats) => {
      pipelineState.lastStats = stats;
    })
    .catch((err) => {
      console.error('[api] pipeline xatosi:', err);
      pipelineState.lastError = err.message;
    })
    .finally(() => {
      pipelineState.running = false;
      pipelineState.finishedAt = new Date().toISOString();
    });

  res.status(202).json({ message: 'Pipeline ishga tushirildi', state: pipelineState });
});

router.post('/pipeline/cancel', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "Pipeline Vercel serverless funksiyasida ishlamaydi." });
  }

  if (!pipelineState.running) {
    return res.status(409).json({ error: "Hech qanday pipeline hozir ishlamayapti", state: pipelineState });
  }

  const { pipelineCancellation } = await import('../jobs/cancellation.js');
  pipelineCancellation.cancel();

  res.status(202).json({ message: "To'xtatish so'rovi yuborildi, bir necha soniyada to'xtaydi", state: pipelineState });
});

router.get('/pipeline/status', (req, res) => {
  res.json({ state: pipelineState });
});

export default router;
