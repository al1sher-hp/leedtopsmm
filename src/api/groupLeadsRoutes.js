import { Router } from 'express';
import config from '../config/index.js';
import { sanitizeUsername } from '../lib/sources/username.js';
import { sha256Phone } from '../lib/phone.js';
import { syncSource } from '../lib/ingest.js';
import {
  listSources,
  createSource,
  getActiveSources,
  listGroupLeads,
  listExportableLeads,
  countTotalLeads,
  countActiveSources,
  countExportableLeads,
  recordExportBatch,
} from '../db/groupLeads.js';

const router = Router();

const VALID_KINDS = ['channel_posts', 'channel_comments'];

// Har bir lead'da bosib ochiladigan asl xabar havolasi bo'lishi kerak —
// bu yerda saqlanmagan (yo'q) bo'lsa null qaytadi, front-end shunga qarab
// havolani ko'rsatmaydi.
function withLink(row) {
  return { ...row, message_url: row.message_url || null };
}

router.get('/sources', async (req, res) => {
  try {
    const sources = await listSources();
    res.json({ data: sources });
  } catch (err) {
    console.error('[group-leads] GET /sources xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post('/sources', async (req, res) => {
  const { kind, title } = req.body || {};
  const username = sanitizeUsername(req.body?.username);

  if (!VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind 'channel_posts' yoki 'channel_comments' bo'lishi kerak` });
  }
  if (!username) {
    return res.status(400).json({ error: "username kiritilishi shart (@username yoki t.me/username formatida)" });
  }

  try {
    const source = await createSource({ kind, title, username });
    res.status(201).json({ data: source });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError' || /unique/i.test(err.message)) {
      return res.status(409).json({ error: 'Bu username shu turdagi manba sifatida allaqachon qo\'shilgan' });
    }
    console.error('[group-leads] POST /sources xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/group-leads', async (req, res) => {
  const sourceId = req.query.sourceId ? parseInt(req.query.sourceId, 10) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
  try {
    const leads = await listGroupLeads({ sourceId, limit });
    res.json({ data: leads.map(withLink) });
  } catch (err) {
    console.error('[group-leads] GET /group-leads xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/group-leads/stats', async (req, res) => {
  try {
    const [total, activeSources, exportable] = await Promise.all([
      countTotalLeads(),
      countActiveSources(),
      countExportableLeads(),
    ]);
    res.json({ total, activeSources, exportable });
  } catch (err) {
    console.error('[group-leads] GET /group-leads/stats xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// CRON_SECRET bilan himoyalangan — Vercel cron (vercel.json) va qo'l bilan
// "Sinxronlash" tugmasi shu orqali chaqiradi. Login/API kalit talab
// qilmaydi (Endpoint 1/2 ochiq), lekin bu endpoint'ning o'zi ochiq
// chaqirilib yuborilmasligi uchun maxfiy kalit bilan qulflangan.
// Eslatma (maxDuration): bu Express catch-all funksiya (api/index.js)
// ichidagi bitta yo'l, Next.js'dagi kabi faylga xos `export const
// maxDuration` bu yerda ishlamaydi — shuning uchun butun funksiya uchun
// 300s limit vercel.json'ning `functions` bo'limida o'rnatilgan.
router.post('/group-leads/sync', async (req, res) => {
  // Vercel Cron `CRON_SECRET` env o'rnatilgan bo'lsa so'rovga avtomatik
  // `Authorization: Bearer <secret>` qo'shadi — shuning uchun u birinchi
  // tekshiriladi; dashboard'dagi "Sinxronlash" tugmasi (operator maxfiy
  // kalitni qo'lda kiritadi — frontend bundle'ida hech qachon saqlanmaydi)
  // esa `x-cron-secret` header'ini yuboradi.
  const authHeader = req.headers.authorization || '';
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = bearerSecret || req.headers['x-cron-secret'] || req.query.secret;
  if (!config.groupLeads.cronSecret || provided !== config.groupLeads.cronSecret) {
    return res.status(401).json({ error: "Ruxsat yo'q — CRON_SECRET mos emas yoki sozlanmagan" });
  }

  try {
    const sources = await getActiveSources();
    const results = [];
    for (const source of sources) {
      try {
        const stats = await syncSource(source);
        results.push({ sourceId: source.id, username: source.username, kind: source.kind, ...stats });
      } catch (err) {
        console.error(`[group-leads] "${source.username}" manbasini sinxronlashda xato:`, err);
        results.push({ sourceId: source.id, username: source.username, kind: source.kind, error: err.message });
      }
    }
    res.json({ synced: results.length, results });
  } catch (err) {
    console.error('[group-leads] POST /group-leads/sync xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// hashed=1 — Telegram Ads Custom Audience "hashed" formatiga mos: sarlavhasiz,
// har qatorda bitta qiymat, lokal hisoblangan SHA256 (E.164 formatdan).
router.get('/group-leads/export', async (req, res) => {
  const hashed = req.query.hashed === '1' || req.query.hashed === 'true';
  try {
    const rows = await listExportableLeads();
    const lines = rows.map((r) => (hashed ? sha256Phone(r.phone_e164) : r.phone_e164));
    await recordExportBatch({ rowCount: lines.length, hashed });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="group-leads-${hashed ? 'hashed' : 'raw'}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[group-leads] GET /group-leads/export xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

export default router;
