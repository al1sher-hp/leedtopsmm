// src/api/outreachRoutes.js
// Telegram outreach: akkountlar, kampaniyalar, javoblar.

import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from '../config/index.js';
import {
  TelegramAccount, Campaign, CampaignTarget, CampaignReply, ScanResult,
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

export default router;
