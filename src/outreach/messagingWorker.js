// src/outreach/messagingWorker.js
// Kampaniya xabar yuborish workeri.
// - DB'dan active TelegramAccount'larni yuklab har biri uchun GramJS client ochadi.
// - Campaign'ning pending target'larini round-robin tartibida jo'natadi.
// - Har akkaunt uchun kunlik limit va delay nazorat qilinadi.

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { TelegramAccount, Campaign, CampaignTarget } from '../db/models.js';
import config from '../config/index.js';
import { Op } from 'sequelize';

const SEND_DELAY_MS = 6000;          // akkaunt boshiga xabarlar orasidagi kutish
const DAY_MS = 24 * 3600 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Har bir akkauntga bitta faol GramJS client saqlanadi (serverni qayta ishga
// tushirmasdan ko'p kampaniya bir xil clientni ishlatadi).
const clientMap = new Map(); // accountId → TelegramClient

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
  console.log(`[outreach] Akkount #${account.id} (${account.label || account.phone || 'nomsiz'}) ulandi`);
  return client;
}

async function disconnectClient(accountId) {
  const c = clientMap.get(accountId);
  if (c) {
    try { await c.disconnect(); } catch {}
    clientMap.delete(accountId);
  }
}

// ─── Worker holat ─────────────────────────────────────────────────────────────
let workerRunning = false;
let stopFlag = false;
const activeCampaignSet = new Set(); // campaign.id'lar

export async function startCampaign(campaignId) {
  await Campaign.update({ status: 'running' }, { where: { id: campaignId } });
  activeCampaignSet.add(campaignId);
  if (!workerRunning) {
    workerRunning = true;
    stopFlag = false;
    runWorker().finally(() => {
      workerRunning = false;
    });
  }
}

export async function pauseCampaign(campaignId) {
  await Campaign.update({ status: 'paused' }, { where: { id: campaignId } });
  activeCampaignSet.delete(campaignId);
  if (activeCampaignSet.size === 0) stopFlag = true;
}

export function getWorkerStatus() {
  return { running: workerRunning, activeCampaigns: [...activeCampaignSet] };
}

// ─── Bitta target'ga xabar yuborish ──────────────────────────────────────────
async function sendToTarget(client, target, campaign) {
  try {
    // GramJS "@username" yoki "+phone" ni o'zi hal qiladi.
    const identifier =
      target.contact_type === 'username'
        ? target.contact_value.startsWith('@')
          ? target.contact_value
          : `@${target.contact_value}`
        : `+${target.contact_value}`;

    const entity = await client.getEntity(identifier);
    const peerId = entity.id?.toString?.() ?? null;

    const result = await client.sendMessage(entity, { message: campaign.message_text });

    await target.update({
      status: 'sent',
      tg_message_id: result.id || null,
      tg_peer_id: peerId,
      sent_at: new Date(),
      error_message: null,
    });

    await Campaign.increment('sent_count', { by: 1, where: { id: campaign.id } });
    return true;
  } catch (err) {
    const errMsg = err.message || String(err);
    const isBan = /USER_PRIVACY_RESTRICTED|PEER_FLOOD|INPUT_USER_DEACTIVATED|banned/i.test(errMsg);

    await target.update({ status: 'failed', error_message: errMsg.slice(0, 512) });
    await Campaign.increment('failed_count', { by: 1, where: { id: campaign.id } });

    if (/FLOOD_WAIT/i.test(errMsg)) {
      const secs = parseInt(errMsg.match(/FLOOD_WAIT_(\d+)/)?.[1] || '60');
      console.warn(`[outreach] FloodWait ${secs}s — kutilmoqda...`);
      await sleep(secs * 1000 + 2000);
    } else if (isBan) {
      console.warn(`[outreach] Target #${target.id}: ${errMsg} — o'tkazib yuborildi`);
    } else {
      console.error(`[outreach] Target #${target.id} xato:`, errMsg);
    }
    return false;
  }
}

// ─── Asosiy worker tsikl ──────────────────────────────────────────────────────
async function runWorker() {
  console.log('[outreach] Worker ishga tushdi');

  while (!stopFlag) {
    if (activeCampaignSet.size === 0) { await sleep(3000); continue; }

    // Akkountlarni yuklash va kunlik limitni yangilash
    const accounts = await TelegramAccount.findAll({ where: { status: 'active' } });
    if (accounts.length === 0) {
      console.warn('[outreach] Aktiv akkount yo\'q — 30s kutilmoqda');
      await sleep(30_000);
      continue;
    }

    const now = Date.now();
    const available = [];
    for (const acc of accounts) {
      if (!acc.last_reset_at || now - new Date(acc.last_reset_at).getTime() > DAY_MS) {
        await acc.update({ messages_today: 0, last_reset_at: new Date() });
        acc.messages_today = 0;
      }
      if (acc.messages_today < acc.daily_limit) available.push(acc);
    }

    if (available.length === 0) {
      console.log('[outreach] Barcha akkountlar kunlik limitda — 5daqiqa kutish');
      await sleep(5 * 60_000);
      continue;
    }

    // Pending targetlarni olish
    const targets = await CampaignTarget.findAll({
      where: {
        status: 'pending',
        campaign_id: { [Op.in]: [...activeCampaignSet] },
      },
      limit: available.length * 2,
      order: [['id', 'ASC']],
    });

    if (targets.length === 0) {
      // Tugagan kampaniyalarni completed qilish
      for (const cid of [...activeCampaignSet]) {
        const remaining = await CampaignTarget.count({ where: { campaign_id: cid, status: 'pending' } });
        if (remaining === 0) {
          await Campaign.update({ status: 'completed' }, { where: { id: cid } });
          activeCampaignSet.delete(cid);
          console.log(`[outreach] Kampaniya #${cid} yakunlandi`);
        }
      }
      if (activeCampaignSet.size === 0) stopFlag = true;
      else await sleep(5000);
      continue;
    }

    // Yuborish — round-robin
    let accIdx = 0;
    for (const target of targets) {
      if (stopFlag) break;

      const acc = available[accIdx % available.length];
      accIdx++;

      let client;
      try {
        client = await getOrCreateClient(acc);
      } catch (err) {
        console.error(`[outreach] Akkount #${acc.id} connect xatosi:`, err.message);
        await acc.update({ status: 'banned' });
        continue;
      }

      const campaign = await Campaign.findByPk(target.campaign_id);
      if (!campaign || campaign.status !== 'running') continue;

      const ok = await sendToTarget(client, target, campaign);
      if (ok) {
        await acc.increment('messages_today', { by: 1 });
        await sleep(SEND_DELAY_MS);
      }
    }

    await sleep(1000);
  }

  // Client'larni yopish
  for (const id of [...clientMap.keys()]) await disconnectClient(id);
  console.log('[outreach] Worker to\'xtatildi');
}
