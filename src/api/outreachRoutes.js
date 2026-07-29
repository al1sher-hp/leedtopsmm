// src/api/outreachRoutes.js
// Telegram outreach: akkountlar, kampaniyalar, javoblar.

import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from '../config/index.js';
import {
  TelegramAccount, Campaign, CampaignTarget, CampaignReply, ScanResult, PhoneLookup,
} from '../db/models.js';
import { startCampaign, pauseCampaign, getWorkerStatus } from '../outreach/messagingWorker.js';
import { checkAllReplies } from '../outreach/inboxMonitor.js';

const router = Router();

// ════════════════════════════════════════════════════════════════════════════
// AKKOUNTLAR
// ════════════════════════════════════════════════════════════════════════════

// GET /api/outreach/accounts
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await TelegramAccount.findAll({
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['session_string'] }, // session_string frontend'ga bermaylik
    });
    res.json({ data: accounts });
  } catch (err) {
    console.error('[outreach] GET /accounts xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/outreach/accounts  { phone?, session_string, label?, daily_limit? }
router.post('/accounts', async (req, res) => {
  try {
    const { phone, session_string, label, daily_limit } = req.body || {};
    if (!session_string?.trim()) {
      return res.status(400).json({ error: 'session_string majburiy' });
    }
    const acc = await TelegramAccount.create({
      phone: phone?.trim() || null,
      session_string: session_string.trim(),
      label: label?.trim() || null,
      daily_limit: daily_limit || 40,
      status: 'unverified',
    });
    res.json({ data: { ...acc.toJSON(), session_string: undefined } });
  } catch (err) {
    console.error('[outreach] POST /accounts xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/outreach/accounts/:id/verify — session'ni tekshirish
router.post('/accounts/:id/verify', async (req, res) => {
  try {
    const acc = await TelegramAccount.findByPk(req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akkount topilmadi' });

    const client = new TelegramClient(
      new StringSession(acc.session_string),
      config.telegram.apiId,
      config.telegram.apiHash,
      { connectionRetries: 2 }
    );
    try {
      await client.connect();
      const me = await client.getMe();
      await client.disconnect();
      await acc.update({ status: 'active', phone: me.phone ? `+${me.phone}` : acc.phone });
      res.json({ ok: true, user: { id: me.id?.toString(), phone: me.phone, username: me.username } });
    } catch (err) {
      await acc.update({ status: 'banned' });
      res.status(400).json({ ok: false, error: err.message });
    }
  } catch (err) {
    console.error('[outreach] verify xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// PATCH /api/outreach/accounts/:id  { status?, label?, daily_limit? }
router.patch('/accounts/:id', async (req, res) => {
  try {
    const acc = await TelegramAccount.findByPk(req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akkount topilmadi' });
    const { status, label, daily_limit } = req.body || {};
    const updates = {};
    if (status) updates.status = status;
    if (label !== undefined) updates.label = label;
    if (daily_limit) updates.daily_limit = daily_limit;
    await acc.update(updates);
    res.json({ data: { ...acc.toJSON(), session_string: undefined } });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// DELETE /api/outreach/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  try {
    const acc = await TelegramAccount.findByPk(req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akkount topilmadi' });
    await acc.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// KAMPANIYALAR
// ════════════════════════════════════════════════════════════════════════════

// GET /api/outreach/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({ order: [['createdAt', 'DESC']] });
    const status = getWorkerStatus();
    res.json({ data: campaigns, workerStatus: status });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/outreach/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampaniya topilmadi' });

    const targetStats = await CampaignTarget.findAll({
      where: { campaign_id: campaign.id },
      attributes: ['status', [fn('COUNT', col('id')), 'cnt']],
      group: ['status'],
      raw: true,
    });

    const unreadReplies = await CampaignReply.count({
      where: { campaign_id: campaign.id, is_read: false },
    });

    res.json({ data: campaign, targetStats, unreadReplies });
  } catch (err) {
    console.error('[outreach] GET /campaigns/:id xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/outreach/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const { name, message_text, message_type, ai_auto_reply, ai_reply_prompt } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name majburiy' });
    if (!message_text?.trim()) return res.status(400).json({ error: 'message_text majburiy' });

    const campaign = await Campaign.create({
      name: name.trim(),
      message_text: message_text.trim(),
      message_type: message_type || 'text',
      ai_auto_reply: !!ai_auto_reply,
      ai_reply_prompt: ai_reply_prompt?.trim() || null,
    });
    res.json({ data: campaign });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// PATCH /api/outreach/campaigns/:id
router.patch('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampaniya topilmadi' });
    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Ishlaётgan kampaniyani tahrirlash uchun avval to\'xtatng' });
    }
    const { name, message_text, message_type, ai_auto_reply, ai_reply_prompt } = req.body || {};
    const updates = {};
    if (name) updates.name = name.trim();
    if (message_text) updates.message_text = message_text.trim();
    if (message_type) updates.message_type = message_type;
    if (ai_auto_reply !== undefined) updates.ai_auto_reply = !!ai_auto_reply;
    if (ai_reply_prompt !== undefined) updates.ai_reply_prompt = ai_reply_prompt?.trim() || null;
    await campaign.update(updates);
    res.json({ data: campaign });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// DELETE /api/outreach/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampaniya topilmadi' });
    await CampaignReply.destroy({ where: { campaign_id: campaign.id } });
    await CampaignTarget.destroy({ where: { campaign_id: campaign.id } });
    await campaign.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/outreach/campaigns/:id/start
router.post('/campaigns/:id/start', async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampaniya topilmadi' });

    const activeAccounts = await TelegramAccount.count({ where: { status: 'active' } });
    if (activeAccounts === 0) {
      return res.status(400).json({ error: 'Aktiv akkount yo\'q. Avval akkount qo\'shing va verify qiling.' });
    }

    const pendingCount = await CampaignTarget.count({
      where: { campaign_id: campaign.id, status: 'pending' },
    });
    if (pendingCount === 0) {
      return res.status(400).json({ error: 'Pending target yo\'q. Avval maqsadlar qo\'shing.' });
    }

    await startCampaign(campaign.id);
    res.json({ ok: true, pendingCount });
  } catch (err) {
    console.error('[outreach] start xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/outreach/campaigns/:id/pause
router.post('/campaigns/:id/pause', async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampaniya topilmadi' });
    await pauseCampaign(campaign.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ─── Targetlar ────────────────────────────────────────────────────────────────

// POST /api/outreach/campaigns/:id/targets
// Body:
//   { scan_session_id, exclude_bots?: bool }  — scan sessiyasidan import
//   { contacts: [{contact_type, contact_value}] }  — qo'lda
router.post('/campaigns/:id/targets', async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampaniya topilmadi' });

    let contacts = [];

    if (req.body.scan_session_id) {
      const { scan_session_id, exclude_bots } = req.body;
      const where = { scan_session_id };
      if (exclude_bots) where.is_bot = false;
      const results = await ScanResult.findAll({ where });
      contacts = results.map((r) => ({
        contact_type: r.contact_type,
        contact_value: r.contact_value,
      }));
    } else if (Array.isArray(req.body.contacts)) {
      contacts = req.body.contacts.filter((c) => c.contact_type && c.contact_value);
    } else {
      return res.status(400).json({ error: 'scan_session_id yoki contacts[] kerak' });
    }

    if (contacts.length === 0) return res.status(400).json({ error: 'Target topilmadi' });

    // Bulk upsert (ignore duplicates)
    let added = 0;
    for (const c of contacts) {
      const [, created] = await CampaignTarget.findOrCreate({
        where: {
          campaign_id: campaign.id,
          contact_type: c.contact_type,
          contact_value: c.contact_value.toLowerCase().replace(/^@/, ''),
        },
        defaults: { status: 'pending' },
      });
      if (created) added++;
    }

    const total = await CampaignTarget.count({ where: { campaign_id: campaign.id } });
    await campaign.update({ total_count: total });

    res.json({ added, total, skipped: contacts.length - added });
  } catch (err) {
    console.error('[outreach] add targets xato:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/outreach/campaigns/:id/targets?status=&page=&limit=
router.get('/campaigns/:id/targets', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where = { campaign_id: req.params.id };
    if (status) where.status = status;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await CampaignTarget.findAndCountAll({
      where,
      order: [['id', 'ASC']],
      limit: parseInt(limit),
      offset,
    });
    res.json({ data: rows, total: count, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ─── Javoblar ─────────────────────────────────────────────────────────────────

// GET /api/outreach/campaigns/:id/replies?unread=true&page=&limit=
router.get('/campaigns/:id/replies', async (req, res) => {
  try {
    const { unread, page = 1, limit = 50 } = req.query;
    const where = { campaign_id: req.params.id };
    if (unread === 'true') where.is_read = false;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await CampaignReply.findAndCountAll({
      where,
      order: [['received_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    res.json({ data: rows, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// PATCH /api/outreach/campaigns/:id/replies/:replyId/read
router.patch('/campaigns/:id/replies/:replyId/read', async (req, res) => {
  try {
    await CampaignReply.update(
      { is_read: true },
      { where: { id: req.params.replyId, campaign_id: req.params.id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/outreach/campaigns/:id/replies/:replyId/respond { text }
// Qo'lda javob yuborish
router.post('/campaigns/:id/replies/:replyId/respond', async (req, res) => {
  try {
    const reply = await CampaignReply.findOne({
      where: { id: req.params.replyId, campaign_id: req.params.id },
    });
    if (!reply) return res.status(404).json({ error: 'Javob topilmadi' });

    const target = await CampaignTarget.findByPk(reply.campaign_target_id);
    if (!target?.tg_peer_id) return res.status(400).json({ error: 'Peer ma\'lumoti yo\'q' });

    const { text } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text majburiy' });

    const account = await TelegramAccount.findOne({ where: { status: 'active' } });
    if (!account) return res.status(400).json({ error: 'Aktiv akkount yo\'q' });

    const client = new TelegramClient(
      new StringSession(account.session_string),
      config.telegram.apiId,
      config.telegram.apiHash,
      { connectionRetries: 2 }
    );
    await client.connect();
    try {
      const entity = await client.getEntity(BigInt(target.tg_peer_id));
      await client.sendMessage(entity, { message: text.trim() });
      await reply.update({ replied: true, replied_at: new Date(), is_read: true });
      res.json({ ok: true });
    } finally {
      await client.disconnect();
    }
  } catch (err) {
    console.error('[outreach] respond xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// POST /api/outreach/campaigns/:id/check-replies — darhol inbox tekshirish
router.post('/campaigns/:id/check-replies', async (req, res) => {
  try {
    checkAllReplies().catch((err) => console.error('[inbox] check xato:', err));
    res.json({ ok: true, message: 'Inbox tekshirish boshlandi (fon rejimda)' });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/outreach/worker — worker holati
router.get('/worker', (req, res) => {
  res.json(getWorkerStatus());
});

// ════════════════════════════════════════════════════════════════════════════
// AKKOUNT YARATISH WIZARD (ketma-ket: telefon → kod → 2FA)
// ════════════════════════════════════════════════════════════════════════════

// In-memory: yarim yaratilgan sessiyalarni saqlash (server restart'da tozalanadi)
const pendingSessions = new Map();

// POST /api/outreach/accounts/create/start { phone }
// Telegramga kod jo'natadi, session_id qaytaradi
router.post('/accounts/create/start', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone?.trim()) return res.status(400).json({ error: 'phone majburiy' });
    const cleanPhone = phone.trim().replace(/\s/g, '');

    const client = new TelegramClient(
      new StringSession(''),
      config.telegram.apiId,
      config.telegram.apiHash,
      { connectionRetries: 3 }
    );
    await client.connect();

    let sendResult;
    try {
      sendResult = await client.sendCode({ apiId: config.telegram.apiId, apiHash: config.telegram.apiHash }, cleanPhone);
    } catch (err) {
      await client.disconnect();
      return res.status(400).json({ error: err.message || 'Kod yuborishda xato' });
    }

    const sessionId = `${cleanPhone}_${Date.now()}`;
    pendingSessions.set(sessionId, { client, phone: cleanPhone, phoneCodeHash: sendResult.phoneCodeHash });

    // 10 daqiqadan keyin avtomatik tozalash
    setTimeout(() => {
      const s = pendingSessions.get(sessionId);
      if (s) { s.client.disconnect().catch(() => {}); pendingSessions.delete(sessionId); }
    }, 10 * 60_000);

    res.json({ ok: true, session_id: sessionId, phone: cleanPhone });
  } catch (err) {
    console.error('[wizard] start xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// POST /api/outreach/accounts/create/confirm { session_id, code }
// Kodni tekshiradi; 2FA kerak bo'lsa needs_2fa: true qaytaradi
router.post('/accounts/create/confirm', async (req, res) => {
  try {
    const { session_id, code } = req.body || {};
    if (!session_id || !code?.trim()) return res.status(400).json({ error: 'session_id va code majburiy' });

    const pending = pendingSessions.get(session_id);
    if (!pending) return res.status(400).json({ error: 'Sessiya topilmadi yoki muddati o\'tgan. Qaytadan boshlang.' });

    const { client, phone, phoneCodeHash } = pending;

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code.trim(),
        })
      );
    } catch (err) {
      if (err.message?.includes('SESSION_PASSWORD_NEEDED')) {
        pending.needs2fa = true;
        return res.json({ ok: true, needs_2fa: true });
      }
      if (err.message?.includes('PHONE_CODE_INVALID') || err.message?.includes('PHONE_CODE_EXPIRED')) {
        return res.status(400).json({ error: 'Kod noto\'g\'ri yoki muddati o\'tgan' });
      }
      return res.status(400).json({ error: err.message || 'Tasdiqlashda xato' });
    }

    // Muvaffaqiyat — session saqlash
    const sessionString = client.session.save();
    const me = await client.getMe();
    await client.disconnect();
    pendingSessions.delete(session_id);

    const acc = await TelegramAccount.create({
      phone: me.phone ? `+${me.phone}` : phone,
      session_string: sessionString,
      label: me.firstName || null,
      daily_limit: 40,
      status: 'active',
    });

    res.json({ ok: true, needs_2fa: false, data: { ...acc.toJSON(), session_string: undefined } });
  } catch (err) {
    console.error('[wizard] confirm xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// POST /api/outreach/accounts/create/2fa { session_id, password }
router.post('/accounts/create/2fa', async (req, res) => {
  try {
    const { session_id, password } = req.body || {};
    if (!session_id || !password?.trim()) return res.status(400).json({ error: 'session_id va password majburiy' });

    const pending = pendingSessions.get(session_id);
    if (!pending) return res.status(400).json({ error: 'Sessiya topilmadi yoki muddati o\'tgan' });

    const { client, phone } = pending;

    try {
      await client.checkPassword(password.trim());
    } catch (err) {
      return res.status(400).json({ error: err.message?.includes('PASSWORD_HASH_INVALID') ? 'Parol noto\'g\'ri' : err.message });
    }

    const sessionString = client.session.save();
    const me = await client.getMe();
    await client.disconnect();
    pendingSessions.delete(session_id);

    const acc = await TelegramAccount.create({
      phone: me.phone ? `+${me.phone}` : phone,
      session_string: sessionString,
      label: me.firstName || null,
      daily_limit: 40,
      status: 'active',
    });

    res.json({ ok: true, data: { ...acc.toJSON(), session_string: undefined } });
  } catch (err) {
    console.error('[wizard] 2fa xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// NOMER QIDIRISH
// ════════════════════════════════════════════════════════════════════════════

// POST /api/outreach/lookup-phone  { username: "@someuser" | "someuser" }
// GramJS getEntity orqali user'ni topadi; `phone` maxfiylik sozlamalariga
// qarab ko'p hollarda bo'sh (null) qaytadi — bu xato emas, kutilgan holat.
router.post('/lookup-phone', async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username?.trim()) {
      return res.status(400).json({ error: 'username majburiy' });
    }
    const query = username.trim().replace(/^@/, '');

    const account = await TelegramAccount.findOne({ where: { status: 'active' } });
    if (!account) {
      return res.status(400).json({ error: "Aktiv Telegram akkount yo'q. Avval akkount qo'shing va verify qiling." });
    }

    const client = new TelegramClient(
      new StringSession(account.session_string),
      config.telegram.apiId,
      config.telegram.apiHash,
      { connectionRetries: 2 }
    );
    await client.connect();
    try {
      let entity;
      try {
        entity = await client.getEntity(query);
      } catch (err) {
        return res.status(404).json({ error: 'Foydalanuvchi topilmadi', detail: err.message });
      }

      const phone = entity.phone ? `+${entity.phone}` : null;
      const result = {
        username: entity.username || query,
        user_id: entity.id?.toString() || null,
        first_name: entity.firstName || null,
        last_name: entity.lastName || null,
        phone,
        is_bot: entity.bot || false,
        ...(phone ? {} : { message: 'Raqam yashirilgan' }),
      };

      await PhoneLookup.create({
        contact_type: 'username',
        contact_value: query.toLowerCase(),
        phone,
        tg_user_id: result.user_id,
        first_name: result.first_name,
        last_name: result.last_name,
        is_bot: result.is_bot,
      });

      res.json({ data: result });
    } finally {
      await client.disconnect();
    }
  } catch (err) {
    console.error('[outreach] lookup-phone xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// POST /api/outreach/lookup-phone-bulk { usernames: string[] }
// Ko'plab username'larni ketma-ket tekshiradi, CSV sifatida qaytaradi
router.post('/lookup-phone-bulk', async (req, res) => {
  try {
    const { usernames } = req.body || {};
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames array majburiy' });
    }
    if (usernames.length > 5000) {
      return res.status(400).json({ error: 'Bir vaqtda maksimal 5000 ta username' });
    }

    const account = await TelegramAccount.findOne({ where: { status: 'active' } });
    if (!account) {
      return res.status(400).json({ error: "Aktiv Telegram akkount yo'q" });
    }

    const client = new TelegramClient(
      new StringSession(account.session_string),
      config.telegram.apiId,
      config.telegram.apiHash,
      { connectionRetries: 2 }
    );
    await client.connect();

    const results = [];
    try {
      for (const raw of usernames) {
        const query = (raw || '').trim().replace(/^@/, '');
        if (!query) { results.push({ username: raw, error: 'bo\'sh' }); continue; }
        try {
          const entity = await client.getEntity(query);
          const phone = entity.phone ? `+${entity.phone}` : null;
          results.push({
            username: entity.username || query,
            user_id: entity.id?.toString() || '',
            first_name: entity.firstName || '',
            last_name: entity.lastName || '',
            phone: phone || '',
            is_bot: entity.bot ? 'ha' : 'yo\'q',
          });
          // Flood nazorat
          await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
          results.push({ username: query, error: err.message?.includes('No user') ? 'topilmadi' : err.message });
        }
      }
    } finally {
      await client.disconnect();
    }

    res.json({ ok: true, total: results.length, data: results });
  } catch (err) {
    console.error('[outreach] lookup-phone-bulk xato:', err);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

export default router;
