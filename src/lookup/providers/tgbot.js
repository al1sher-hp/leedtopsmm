import { getPool } from '../../telegram/client.js';
import config from '../../config/index.js';
import {
  ask,
  LookupSubscriptionRequiredError,
  LookupQuotaExhaustedError,
} from '../bridge/botBridge.js';
import { parseTelefonRaqamTopishbot } from '../bridge/parsers/telefonRaqamTopishbot.js';
import { isLikelyFinalMessage } from '../bridge/parsers/generic.js';

export const PROVIDER_NAME = 'tgbot';

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

  const pool = await getPool();

  try {
    const { text, code } = await ask(pool, config.lookup.botUsername, query, {
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

export default { lookupViaTgBot, botState, resetBotState, PROVIDER_NAME };
