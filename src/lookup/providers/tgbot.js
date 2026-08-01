import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from '../../config/index.js';
import { TelegramAccount } from '../../db/models.js';
import { RateLimitedSession } from '../../telegram/client.js';
import {
  ask,
  LookupSubscriptionRequiredError,
  LookupQuotaExhaustedError,
} from '../bridge/botBridge.js';
import { parseTelefonRaqamTopishbot } from '../bridge/parsers/telefonRaqamTopishbot.js';
import { isLikelyFinalMessage } from '../bridge/parsers/generic.js';

export const PROVIDER_NAME = 'tgbot';

// Kampaniya akkauntlari (getPool()) BALANS RISKINI shu bot bilan
// baham ko'rmasligi kerak — tashqi bot noma'lum/shubhali xatti-harakatga ega
// bo'lishi mumkin (docs/DATA-RISK.md), shuning uchun lookup UMUMIY pool'dan
// ATAYLAB mustaqil, faqat shu maqsad uchun belgilangan (`label` bilan)
// akkauntni ishlatadi. Bunday akkaunt topilmasa — UMUMIY getPool()ga HECH
// QACHON tushib ketmaydi (fallback yo'q), aniq xato tashlanadi.
export async function findLookupAccount() {
  const account = await TelegramAccount.findOne({
    where: { label: config.lookup.botAccountLabel, status: 'active' },
  });
  if (!account) {
    throw new Error(
      `Lookup uchun alohida akkaunt topilmadi (label: ${config.lookup.botAccountLabel}) — qo'shing`
    );
  }
  return account;
}

// Bir marta ulanib, keyingi chaqiruvlarda qayta ishlatiladi (getPool()dagi
// singleton naqshi bilan bir xil), lekin butunlay ALOHIDA ulanish —
// SessionPool'ning bir qismi emas.
let lookupClient = null;

async function getLookupClient() {
  if (lookupClient) return lookupClient;

  const account = await findLookupAccount();
  const rawClient = new TelegramClient(
    new StringSession(account.session_string),
    config.telegram.apiId,
    config.telegram.apiHash,
    { connectionRetries: 5 }
  );
  await rawClient.connect();

  // botBridge.ask() pool-ga o'xshash interfeys kutadi (.invoke() +
  // .primaryClient) — RateLimitedSession o'zining FloodWait/backoff/rate-limit
  // mexanizmini shu (mustaqil) sessiya uchun alohida hisoblagichlar bilan
  // ta'minlaydi (kampaniya trafigi bilan aralashmaydi).
  const session = new RateLimitedSession(rawClient, 'lookup');
  lookupClient = {
    invoke: (request, opts) => session.invoke(request, opts),
    primaryClient: rawClient,
  };
  return lookupClient;
}

// Bot holatini kuzatish uchun modul-darajasidagi holat — GET /api/lookup/providers
// shundan o'qiydi ("obuna kerak"/"limit tugadi" bannerini ko'rsatish uchun).
// Bir marta subscription/quota aniqlansa, keyingi so'rovlar botga
// yuborilmasdan darhol xato qaytaradi — sabab: bu holatlar odatda o'zidan
// o'zi tuzalmaydi (qo'lda hal qilinishi kerak), qayta-qayta urinish botni
// battar "spam" deb belgilashi mumkin.
export const botState = {
  subscriptionRequired: false,
  quotaExhausted: false,
  lastError: null,
  lastErrorAt: null,
};

export function resetBotState() {
  botState.subscriptionRequired = false;
  botState.quotaExhausted = false;
  botState.lastError = null;
  botState.lastErrorAt = null;
}

export async function lookupViaTgBot(query) {
  if (botState.subscriptionRequired) {
    throw new LookupSubscriptionRequiredError('avvalgi tekshiruvda aniqlangan (qayta urinish uchun holatni tozalang)');
  }
  if (botState.quotaExhausted) {
    throw new LookupQuotaExhaustedError('avvalgi tekshiruvda aniqlangan (kunlik limit)');
  }

  const client = await getLookupClient();

  try {
    const { text, code } = await ask(client, config.lookup.botUsername, query, {
      timeoutMs: config.lookup.botTimeoutMs,
      minIntervalMs: config.lookup.minIntervalMs,
      isFinal: isLikelyFinalMessage,
    });

    // HIMOYA #6 asosi: bu manba HECH QACHON 'verified' deb belgilanmaydi —
    // real vaqtdagi Telegram ma'lumoti emas, eski snapshot bazadan javob.
    const baseResult = {
      username: null,
      is_bot: false,
      provider: PROVIDER_NAME,
      confidence: 'unverified',
      source_note: "Tashqi bot bazasi — real vaqt emas, tasdiqlanmagan",
      raw_response: text,
    };

    if (code === 'LOOKUP_NOT_FOUND') {
      return { ...baseResult, found: false, phone: null, user_id: null, first_name: null, last_name: null };
    }

    const parsed = parseTelefonRaqamTopishbot(text);
    return {
      ...baseResult,
      found: parsed.found,
      phone: parsed.phone,
      user_id: parsed.user_id,
      first_name: parsed.first_name,
      last_name: parsed.last_name,
    };
  } catch (err) {
    if (err.code === 'LOOKUP_SUBSCRIPTION_REQUIRED') botState.subscriptionRequired = true;
    if (err.code === 'LOOKUP_QUOTA_EXHAUSTED') botState.quotaExhausted = true;
    botState.lastError = err.message;
    botState.lastErrorAt = new Date().toISOString();
    throw err;
  }
}

export default { lookupViaTgBot, botState, resetBotState, findLookupAccount, PROVIDER_NAME };
