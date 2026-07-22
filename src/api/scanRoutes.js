import { Router } from 'express';
import { ScanSession, ScanResult } from '../db/models.js';
import { parseIdentifier } from '../blacklist/blacklist.js';
import { sanitizeKeywords, MAX_KEYWORDS } from '../utils/keywords.js';

const router = Router();

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

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const SCAN_RESULT_CSV_COLUMNS = [
  'source_title', 'source_username', 'contact_type', 'contact_value',
  'is_bot', 'message_date', 'message_link', 'matched_keyword', 'match_count',
];

function toCsv(rows) {
  const headerLine = SCAN_RESULT_CSV_COLUMNS.join(',');
  const lines = rows
    .map(withMessageLink)
    .map((r) => SCAN_RESULT_CSV_COLUMNS.map((col) => toCsvValue(r[col])).join(','));
  return '﻿' + [headerLine, ...lines].join('\n');
}

// Har bir skanerlash o'z sessiyasida saqlanadi — "fayl menejeri"dagi papka
// kabi, turli skanerlashlar natijalari bir-biriga aralashmaydi.
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await ScanSession.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ data: sessions });
  } catch (err) {
    console.error('[scan] GET /sessions xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await ScanSession.findByPk(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessiya topilmadi' });

    const results = await ScanResult.findAll({
      where: { scan_session_id: session.id },
      order: [['message_date', 'DESC']],
    });

    res.json({ session, results: results.map(withMessageLink) });
  } catch (err) {
    console.error('[scan] GET /sessions/:id xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/sessions/:id/export.csv', async (req, res) => {
  try {
    const session = await ScanSession.findByPk(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessiya topilmadi' });

    const results = await ScanResult.findAll({
      where: { scan_session_id: session.id },
      order: [['message_date', 'DESC']],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scan-${session.id}.csv"`);
    res.send(toCsv(results));
  } catch (err) {
    console.error('[scan] GET /sessions/:id/export.csv xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await ScanSession.findByPk(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessiya topilmadi' });

    await ScanResult.destroy({ where: { scan_session_id: session.id } });
    await session.destroy();

    res.json({ deleted: true });
  } catch (err) {
    console.error('[scan] DELETE /sessions/:id xato:', err);
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

  // Skanerlash uchun kalit so'z ixtiyoriy (bo'sh bo'lsa barcha kontaktlar
  // yig'iladi) — lekin berilgan bo'lsa ham tozalanadi (trim/bo'sh/dublikat)
  // va yuqori chegara bilan cheklanadi.
  const keywords = sanitizeKeywords(req.body?.keywords);

  if (keywords.length > MAX_KEYWORDS) {
    return res.status(400).json({
      error: `Juda ko'p kalit so'z — bir martada ko'pi bilan ${MAX_KEYWORDS} ta so'z bering (${keywords.length} ta berildi).`,
    });
  }

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
