import { Router } from 'express';
import { BlacklistEntry, Lead } from '../db/models.js';
import { getPool } from '../telegram/client.js';
import { parseIdentifier, generateVerificationCode, invalidateCache } from '../blacklist/blacklist.js';
import { resolveTarget, fetchAboutText } from '../blacklist/verify.js';

const router = Router();

const VERIFICATION_TTL_MS = 30 * 60_000;

// Ochiq (login talab qilmaydigan) endpoint'lar uchun oddiy per-IP so'rov
// cheklovi — bo'lmasa har bir so'rov bizning Telegram byudjetimizni
// (ResolveUsername/GetFullChannel/GetFullUser chaqiruvlari) suiiste'mol
// qilishi mumkin edi.
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitState = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateLimitState.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(ip, { count: 1, windowStart: now });
    return next();
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Juda ko'p so'rov yuborildi — biroz kutib qayta urinib ko'ring." });
  }
  entry.count += 1;
  next();
}

// Hamma uchun ochiq ro'yxat — shaffoflik uchun (kimlar blacklist qilinganini
// har kim ko'rishi mumkin).
router.get('/', async (req, res) => {
  try {
    const entries = await BlacklistEntry.findAll({
      where: { status: 'active' },
      attributes: ['target_id', 'target_type', 'target_username', 'target_title', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    res.json({ data: entries });
  } catch (err) {
    console.error('[blacklist] GET / xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Egalikni tekshirish uchun jonli Telegram ulanishi (getPool()) kerak — xuddi
// pipeline kabi, Vercel serverless funksiyasida doimiy MTProto ulanish
// ushlab turib bo'lmaydi.
function requireNonServerless(req, res, next) {
  if (process.env.VERCEL) {
    return res.status(501).json({
      error:
        "Bu amal Vercel serverless funksiyasida ishlamaydi (doimiy Telegram ulanishi kerak). " +
        "Doim ishlaydigan hostda (Railway/Render/VPS) yoki lokal ishlatilganda ishlaydi.",
    });
  }
  next();
}

router.post('/request', requireNonServerless, rateLimit, async (req, res) => {
  try {
    const identifier = parseIdentifier(req.body?.identifier);
    if (!identifier) {
      return res.status(400).json({
        error:
          "Yaroqsiz manzil — @username yoki https://t.me/username formatida kiriting (taklif havolalari qo'llab-quvvatlanmaydi).",
      });
    }

    const pool = await getPool();
    let resolved;
    try {
      resolved = await resolveTarget(pool, identifier);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let entry = await BlacklistEntry.findOne({ where: { target_id: resolved.target_id } });

    if (entry && entry.status === 'active') {
      return res.json({
        alreadyActive: true,
        message: "Bu obyekt allaqachon qora ro'yxatda — qo'shimcha amal shart emas.",
        target: resolved,
      });
    }

    const verification_code = generateVerificationCode();
    const verification_expires_at = new Date(Date.now() + VERIFICATION_TTL_MS);

    if (entry) {
      await entry.update({ ...resolved, pending_action: 'add', verification_code, verification_expires_at });
    } else {
      entry = await BlacklistEntry.create({
        ...resolved,
        status: 'pending',
        pending_action: 'add',
        verification_code,
        verification_expires_at,
      });
    }

    res.json({
      targetId: resolved.target_id,
      targetType: resolved.target_type,
      targetTitle: resolved.target_title,
      targetUsername: resolved.target_username,
      verificationCode: verification_code,
      expiresAt: verification_expires_at,
      instructions:
        resolved.target_type === 'bot'
          ? "Bu kodni botingizning tavsifiga @BotFather → /setabouttext orqali vaqtincha qo'ying, so'ng \"Tasdiqlash\" tugmasini bosing."
          : "Bu kodni kanal/guruhingiz tavsifiga (About/Tavsif) vaqtincha qo'ying, so'ng \"Tasdiqlash\" tugmasini bosing.",
    });
  } catch (err) {
    console.error('[blacklist] POST /request xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post('/verify', requireNonServerless, rateLimit, async (req, res) => {
  try {
    const targetId = String(req.body?.targetId || '');
    const entry = await BlacklistEntry.findOne({ where: { target_id: targetId } });
    if (!entry || !entry.pending_action) {
      return res.status(404).json({ error: "Tasdiqlash kutilayotgan so'rov topilmadi." });
    }
    if (!entry.verification_expires_at || entry.verification_expires_at < new Date()) {
      return res.status(400).json({ error: "Kod muddati tugagan — qaytadan so'rov yuboring." });
    }

    const pool = await getPool();
    let aboutText;
    try {
      aboutText = await fetchAboutText(pool, entry);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!aboutText.includes(entry.verification_code)) {
      return res.status(400).json({
        error: "Kod topilmadi — tavsifga to'g'ri joylashtirib, saqlaganingizni tekshiring.",
      });
    }

    if (entry.pending_action === 'remove') {
      await entry.destroy();
      invalidateCache();
      return res.json({ removed: true });
    }

    await entry.update({
      status: 'active',
      pending_action: null,
      verification_code: null,
      verification_expires_at: null,
    });
    invalidateCache();

    // Blacklist tasdiqlangach, avval yig'ilgan bo'lsa ham ma'lumot o'chiriladi
    // — "hech bir lead o'chirilmaydi" qoidasiga ataylab qilingan yagona istisno.
    const purgedLeads = await Lead.destroy({ where: { channel_id: entry.target_id } });

    res.json({ activated: true, purgedLeads });
  } catch (err) {
    console.error('[blacklist] POST /verify xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post('/:targetId/remove-request', requireNonServerless, rateLimit, async (req, res) => {
  try {
    const entry = await BlacklistEntry.findOne({ where: { target_id: req.params.targetId, status: 'active' } });
    if (!entry) {
      return res.status(404).json({ error: "Aktiv qora ro'yxat yozuvi topilmadi." });
    }

    const verification_code = generateVerificationCode();
    const verification_expires_at = new Date(Date.now() + VERIFICATION_TTL_MS);
    await entry.update({ pending_action: 'remove', verification_code, verification_expires_at });

    res.json({
      targetId: entry.target_id,
      targetType: entry.target_type,
      targetTitle: entry.target_title,
      targetUsername: entry.target_username,
      verificationCode: verification_code,
      expiresAt: verification_expires_at,
      instructions:
        "Olib tashlashni tasdiqlash uchun shu kodni yana tavsifga (yoki bot uchun /setabouttext bilan) vaqtincha qo'ying, so'ng \"Tasdiqlash\" tugmasini bosing. Bu — begona odam sizning obyektingizni qora ro'yxatdan o'zboshimchalik bilan olib tashlay olmasligi uchun.",
    });
  } catch (err) {
    console.error('[blacklist] POST /:targetId/remove-request xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

export default router;
