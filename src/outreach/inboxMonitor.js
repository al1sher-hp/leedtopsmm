// src/outreach/inboxMonitor.js
// Kelgan javoblarni tekshirish va AI auto-reply.
// - `sent` holatlardagi target'lar uchun Telegram dialogini text orqali ko'rib chiqadi.
// - Yangi xabarlar topilsa CampaignReply yozadi.
// - ai_auto_reply yoqilgan kampaniyalarda Gemini orqali javob generatsiya qilib yuboradi.

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import { GoogleGenAI } from '@google/genai';
import { Campaign, CampaignTarget, CampaignReply, TelegramAccount } from '../db/models.js';
import config from '../config/index.js';
import { Op } from 'sequelize';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Gemini AI javob ──────────────────────────────────────────────────────────
async function generateAiReply(campaign, incomingText) {
  try {
    const systemPrompt = campaign.ai_reply_prompt?.trim()
      || 'Mijoz xabariga qisqacha, do\'stona va professional tilda javob yoz. Javob 1-3 jumladan oshmasin.';
    const prompt = `${systemPrompt}\n\nMijoz xabari: "${incomingText}"`;
    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: prompt,
    });
    return (response.text || '').trim();
  } catch (err) {
    console.warn('[inbox] AI javob generatsiyada xato:', err.message);
    return null;
  }
}

// ─── Bitta akkount + target tekshirish ───────────────────────────────────────
const clientMap = new Map();

async function getOrCreateClient(account) {
  if (clientMap.has(account.id)) return clientMap.get(account.id);
  const client = new TelegramClient(
    new StringSession(account.session_string),
    config.telegram.apiId,
    config.telegram.apiHash,
    { connectionRetries: 3, autoReconnect: true }
  );
  await client.connect();
  clientMap.set(account.id, client);
  return client;
}

async function checkTargetReplies(client, target, campaign) {
  if (!target.tg_peer_id) return;

  try {
    const selfId = (await client.getMe())?.id?.toString?.();

    // GetHistory: so'nggi 20 xabarni olish
    const entity = await client.getEntity(BigInt(target.tg_peer_id)).catch(() => null);
    if (!entity) return;

    const msgs = await client.getMessages(entity, { limit: 20 });
    const sentAt = target.sent_at ? new Date(target.sent_at).getTime() / 1000 : 0;

    let newReplyFound = false;

    for (const msg of msgs) {
      if (!msg.text) continue;
      const fromId = msg.senderId?.toString?.() ?? msg.fromId?.userId?.toString?.();
      // Faqat qarama-taraffdan kelgan xabarlar (o'zim yuborganlar emas)
      if (fromId === selfId) continue;
      if (msg.date < sentAt) continue; // yuborilishdan avvalgi xabarlar emas

      const msgIdBig = BigInt(msg.id);
      const existing = await CampaignReply.findOne({
        where: { campaign_target_id: target.id, tg_message_id: msgIdBig },
      });
      if (existing) continue;

      // AI javob
      let aiSuggested = null;
      if (campaign.ai_auto_reply) {
        aiSuggested = await generateAiReply(campaign, msg.text);
      }

      await CampaignReply.create({
        campaign_id: campaign.id,
        campaign_target_id: target.id,
        from_user_id: fromId || null,
        from_username: msg.sender?.username || null,
        message_text: msg.text.slice(0, 4000),
        tg_message_id: msgIdBig,
        received_at: new Date(msg.date * 1000),
        ai_suggested_reply: aiSuggested,
      });

      newReplyFound = true;

      // AI auto-reply — javobni avtomatik yuborish
      if (campaign.ai_auto_reply && aiSuggested) {
        try {
          await client.sendMessage(entity, { message: aiSuggested, replyTo: msg.id });
          console.log(`[inbox] AI javob yuborildi → target #${target.id}`);
        } catch (err) {
          console.warn('[inbox] AI javob yuborishda xato:', err.message);
        }
        await sleep(3000);
      }
    }

    if (newReplyFound) {
      await target.update({ status: 'replied' });
      await Campaign.increment('replied_count', { by: 1, where: { id: campaign.id } });
    }
  } catch (err) {
    // Foydalanuvchi o'chirib tashlagan yoki kirish yo'q — jimgina o'tkazib yuborish
    if (!/USER_PRIVACY|PEER_FLOOD|INPUT_USER_DEACTIVATED/i.test(err.message)) {
      console.warn(`[inbox] Target #${target.id} tekshirishda xato:`, err.message);
    }
  }
}

// ─── Asosiy monitor funksiyasi ─────────────────────────────────────────────────
export async function checkAllReplies() {
  const accounts = await TelegramAccount.findAll({ where: { status: 'active' } });
  if (accounts.length === 0) return;

  // `sent` + `replied` — bir marta reply topilgan target'lar ham yangi
  // xabarlar uchun yana tekshiriladi (dialog davom etishi mumkin).
  const targets = await CampaignTarget.findAll({
    where: { status: { [Op.in]: ['sent', 'replied'] }, tg_peer_id: { [Op.ne]: null } },
    include: [{ model: Campaign, as: 'campaign', required: true }],
    limit: 200,
    order: [['sent_at', 'DESC']],
  });

  // Sequelize include ishlamasligi ehtimolini hisobga olib Campaign'ni alohida yuklaymiz
  const campaignIds = [...new Set(targets.map((t) => t.campaign_id))];
  const campaigns = await Campaign.findAll({ where: { id: { [Op.in]: campaignIds } } });
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  let accIdx = 0;
  for (const target of targets) {
    const campaign = campaignMap.get(target.campaign_id);
    if (!campaign) continue;

    const acc = accounts[accIdx % accounts.length];
    accIdx++;

    let client;
    try {
      client = await getOrCreateClient(acc);
    } catch {
      continue;
    }

    await checkTargetReplies(client, target, campaign);
    await sleep(1500);
  }
}

// ─── Fon tsikli (har 5 daqiqa) ───────────────────────────────────────────────
let monitorInterval = null;

export function startMonitor(intervalMs = 5 * 60_000) {
  if (monitorInterval) return;
  monitorInterval = setInterval(async () => {
    try { await checkAllReplies(); } catch (err) {
      console.error('[inbox] Monitor xatosi:', err.message);
    }
  }, intervalMs);
  console.log('[inbox] Monitor ishga tushdi (har', intervalMs / 60000, 'daqiqa)');
}

export function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
