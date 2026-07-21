import { Router } from 'express';
import { Op } from 'sequelize';
import { ScanResult } from '../db/models.js';
import { parseIdentifier } from '../blacklist/blacklist.js';

const router = Router();

function buildWhere(query) {
  const where = {};
  if (query.source_channel_id) where.source_channel_id = query.source_channel_id;
  if (query.contact_type) where.contact_type = query.contact_type;
  return where;
}

// Xabar havolasi faqat ochiq (username'li) manba + saqlangan message_id
// bo'lsa quriladi — tizim faqat shunday manbalarni skanerlaydi, shuning
// uchun amalda deyarli har doim mavjud bo'ladi.
function withMessageLink(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  const message_link =
    plain.source_username && plain.message_id
      ? `https://t.me/${plain.source_username}/${plain.message_id}`
      : null;
  return { ...plain, message_link };
}

router.get('/', async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { rows, count } = await ScanResult.findAndCountAll({
      where,
      order: [['message_date', 'DESC']],
      limit,
      offset,
    });

    res.json({
      data: rows.map(withMessageLink),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error('[scan] GET / xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.get('/export.csv', async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const rows = await ScanResult.findAll({ where, order: [['message_date', 'DESC']] });

    const columns = [
      'source_title', 'source_username', 'contact_type', 'contact_value',
      'is_bot', 'message_date', 'message_link', 'matched_keyword', 'match_count',
    ];
    const headerLine = columns.join(',');
    const lines = rows.map(withMessageLink).map((r) => columns.map((col) => toCsvValue(r[col])).join(','));
    const csv = [headerLine, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="scan-results.csv"');
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[scan] GET /export.csv xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Skanerlashni background'da ishga tushirish + holatini kuzatish uchun sodda
// xotiradagi state — pipeline'dagi bilan bir xil pattern (routes.js).
const scanState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastStats: null,
  lastError: null,
  target: null,
};

router.post('/run', async (req, res) => {
  // scanChannel() ham doimiy MTProto ulanish (getPool()) talab qiladi —
  // pipeline bilan bir xil sabab bilan Vercel serverless'da ishlamaydi.
  if (process.env.VERCEL) {
    return res.status(501).json({
      error:
        "Kanal skanerlash Vercel serverless funksiyasida ishlamaydi (doimiy Telegram ulanishi kerak). " +
        "Doim ishlaydigan hostda (Railway/Render/VPS) yoki lokal ishlatilganda ishlaydi.",
    });
  }

  if (scanState.running) {
    return res.status(409).json({ error: 'Skanerlash allaqachon ishlamoqda', state: scanState });
  }

  const identifier = parseIdentifier(req.body?.identifier);
  if (!identifier) {
    return res.status(400).json({
      error: "Yaroqsiz manzil — @username yoki https://t.me/username formatida kanal/guruh kiriting.",
    });
  }

  const { dateFrom, dateTo } = req.body || {};
  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: "Sana oralig'i (boshlanish va tugash) kiritilishi shart." });
  }
  const dateFromSec = Math.floor(new Date(dateFrom).getTime() / 1000);
  const dateToSec = Math.floor(new Date(dateTo).getTime() / 1000);
  if (!Number.isFinite(dateFromSec) || !Number.isFinite(dateToSec) || dateFromSec > dateToSec) {
    return res.status(400).json({ error: "Sana oralig'i yaroqsiz." });
  }

  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  scanState.running = true;
  scanState.startedAt = new Date().toISOString();
  scanState.finishedAt = null;
  scanState.lastError = null;
  scanState.target = { identifier };

  const { runChannelScan } = await import('../jobs/runChannelScan.js');

  runChannelScan({ identifier, dateFromSec, dateToSec, keywords })
    .then((stats) => {
      scanState.lastStats = stats;
      scanState.target = stats.target || scanState.target;
    })
    .catch((err) => {
      console.error('[scan] xato:', err);
      scanState.lastError = err.message;
    })
    .finally(() => {
      scanState.running = false;
      scanState.finishedAt = new Date().toISOString();
    });

  res.status(202).json({ message: 'Skanerlash ishga tushirildi', state: scanState });
});

router.post('/cancel', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: 'Kanal skanerlash Vercel serverless funksiyasida ishlamaydi.' });
  }
  if (!scanState.running) {
    return res.status(409).json({ error: 'Hech qanday skanerlash hozir ishlamayapti', state: scanState });
  }

  const { scanCancellation } = await import('../jobs/scanCancellation.js');
  scanCancellation.cancel();

  res.status(202).json({ message: "To'xtatish so'rovi yuborildi, bir necha soniyada to'xtaydi", state: scanState });
});

router.get('/status', (req, res) => {
  res.json({ state: scanState });
});

export default router;
