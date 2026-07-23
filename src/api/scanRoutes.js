import { Router } from 'express';
import * as XLSX from 'xlsx';
import { Lead, ScanSession, ScanResult } from '../db/models.js';
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

  const captureSenders = req.body?.captureSenders === true;

  scanState.running = true;
  scanState.startedAt = new Date().toISOString();
  scanState.finishedAt = null;
  scanState.lastError = null;
  scanState.target = { identifier };

  const { runChannelScan } = await import('../jobs/runChannelScan.js');

  runChannelScan({ identifier, dateFromSec, dateToSec, keywords, captureSenders })
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

// Scan sessiyasi natijalarini XLSX (Excel) formatida yuklab olish.
// @Markoy_Legend_bot kabi group-users.xlsx formati: username, phone, match_count va h.k.
router.get('/sessions/:id/export.xlsx', async (req, res) => {
  try {
    const session = await ScanSession.findByPk(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessiya topilmadi' });

    const results = await ScanResult.findAll({
      where: { scan_session_id: session.id },
      order: [['match_count', 'DESC']],
    });

    const rows = results.map((r) => {
      const plain = r.toJSON ? r.toJSON() : r;
      return {
        Tur: plain.contact_type === 'phone' ? 'Telefon' : 'Username',
        Kontakt: plain.contact_value,
        Bot: plain.is_bot ? 'Ha' : "Yo'q",
        'Uchrashuv soni': plain.match_count,
        Kalit_soz: plain.matched_keyword || '',
        Sana: plain.message_date ? new Date(plain.message_date).toLocaleString('uz') : '',
        Havola: plain.source_username && plain.message_id
          ? `https://t.me/${plain.source_username}/${plain.message_id}`
          : '',
        Manba: plain.source_title || plain.source_username || '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    // Ustun kengliklarini avtomatik belgilash
    ws['!cols'] = [
      { wch: 10 }, { wch: 25 }, { wch: 6 }, { wch: 14 }, { wch: 15 }, { wch: 20 }, { wch: 45 }, { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Kontaktlar');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `scan-${session.source_username || session.id}-kontaktlar.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('[scan] GET /sessions/:id/export.xlsx xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

/**
 * Guruh/kanal a'zolarini XLSX formatida eksport qilish.
 * @Markoy_Legend_bot kabi group-<id>-users.xlsx fayl chiqaradi.
 * Body: { identifier: "@username" }
 */
router.post('/participants', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "A'zolar eksporti Vercel'da ishlamaydi — doim ishlaydigan host kerak." });
  }

  const identifier = parseIdentifier(req.body?.identifier);
  if (!identifier) {
    return res.status(400).json({ error: "@username yoki t.me/username formatida kanal/guruh kiriting." });
  }

  try {
    const { getPool } = await import('../telegram/client.js');
    const { resolveChannelOrGroup } = await import('../scan/channelScan.js');
    const { Api } = await import('telegram');

    const pool = await getPool();
    const chat = await resolveChannelOrGroup(pool, identifier);
    const inputChannel = new Api.InputChannel({ channelId: chat.id, accessHash: chat.accessHash });

    const participants = [];
    let offset = 0;
    const limit = 200;

    while (true) {
      const result = await pool.invoke(
        new Api.channels.GetParticipants({
          channel: inputChannel,
          filter: new Api.ChannelParticipantsSearch({ q: '' }),
          offset,
          limit,
          hash: 0n,
        })
      );

      const users = result.users || [];
      if (users.length === 0) break;

      for (const u of users) {
        participants.push({
          ID: u.id?.toString() || '',
          Ism: [u.firstName, u.lastName].filter(Boolean).join(' '),
          Username: u.username ? `@${u.username}` : '',
          Telefon: u.phone ? `+${u.phone}` : '',
          Bot: u.bot ? 'Ha' : "Yo'q",
          Premium: u.premium ? 'Ha' : "Yo'q",
          Deleted: u.deleted ? 'Ha' : "Yo'q",
        });
      }

      offset += users.length;
      if (users.length < limit) break;
      // Flood limitdan himoya: har 200 ta so'rovdan keyin 2 soniya kut
      await new Promise((r) => setTimeout(r, 2000));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(participants);
    ws['!cols'] = [
      { wch: 14 }, { wch: 25 }, { wch: 22 }, { wch: 16 }, { wch: 6 }, { wch: 8 }, { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "A'zolar");

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const groupId = chat.id?.toString() || identifier.replace('@', '');
    const filename = `group-${groupId}-users.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('[scan] POST /participants xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

/**
 * Kanal skanerlash sessiyasini Lead'ga ko'chirish.
 * Sessiyaning manbasi (kanal/guruh) Lead jadvaliga qo'shiladi yoki yangilanadi,
 * skanerlashda topilgan telefon/username kontakt sifatida ishlatiladi.
 */
router.post('/sessions/:id/promote', async (req, res) => {
  try {
    const session = await ScanSession.findByPk(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessiya topilmadi' });
    if (!session.source_channel_id) {
      return res.status(400).json({ error: "Bu sessiyada kanal ma'lumoti yo'q" });
    }

    // Sessiya natijalaridan eng yaxshi kontaktni tanlaymiz (bot emas, ko'p uchraydigan)
    const results = await ScanResult.findAll({
      where: { scan_session_id: session.id },
      order: [['match_count', 'DESC']],
    });

    const phoneResult = results.find((r) => r.contact_type === 'phone' && !r.is_bot);
    const usernameResult = results.find((r) => r.contact_type === 'username' && !r.is_bot);

    const phone = phoneResult?.contact_value || null;
    const contactUsername = usernameResult?.contact_value || null;
    let contactType = 'none';
    if (phone && contactUsername) contactType = 'both';
    else if (phone) contactType = 'phone';
    else if (contactUsername) contactType = 'username';

    const [lead, created] = await Lead.findOrCreate({
      where: { channel_id: session.source_channel_id },
      defaults: {
        channel_title: session.source_title || session.source_username || "Noma'lum kanal",
        channel_username: session.source_username || null,
        channel_id: session.source_channel_id,
        type: session.source_type || 'channel',
        phone,
        contact_username: contactUsername,
        contact_type: contactType,
        source: 'scan',
      },
    });

    if (!created) {
      // Mavjud leadga yangi topilgan kontaktni qo'shamiz (bo'sh bo'lgan maydonlarga)
      const updates = {};
      if (phone && !lead.phone) updates.phone = phone;
      if (contactUsername && !lead.contact_username) updates.contact_username = contactUsername;
      if (Object.keys(updates).length > 0) {
        const newPhone = updates.phone || lead.phone;
        const newUsername = updates.contact_username || lead.contact_username;
        if (newPhone && newUsername) updates.contact_type = 'both';
        else if (newPhone) updates.contact_type = 'phone';
        else if (newUsername) updates.contact_type = 'username';
        await lead.update(updates);
      }
    }

    res.json({ lead, created });
  } catch (err) {
    console.error('[scan] POST /sessions/:id/promote xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

export default router;
