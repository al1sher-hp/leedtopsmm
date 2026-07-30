import { Api } from 'telegram';
import { NewMessage } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import config from '../../config/index.js';
import { backoffDelayMs } from '../../telegram/client.js';

// ─── Xato tiplari — har biri alohida kod, alohida reaksiya ─────────────────
export class LookupBridgeError extends Error {
  constructor(code, message, botText) {
    super(message);
    this.name = code;
    this.code = code;
    this.botText = botText || null;
  }
}
export class LookupSubscriptionRequiredError extends LookupBridgeError {
  constructor(botText) {
    super('LOOKUP_SUBSCRIPTION_REQUIRED', "Bot obuna/kanalga a'zolikni talab qilmoqda", botText);
  }
}
export class LookupQuotaExhaustedError extends LookupBridgeError {
  constructor(botText) {
    super('LOOKUP_QUOTA_EXHAUSTED', 'Bot kunlik limiti/balansi tugagan', botText);
  }
}
export class LookupTimeoutError extends LookupBridgeError {
  constructor() {
    super('LOOKUP_TIMEOUT', "Bot javob bermadi (timeout)");
  }
}

// Bot javobida "obuna bo'ling"/"limit tugadi"/"topilmadi" borligini
// aniqlaydigan kalit so'zlar — uz+ru, keng qamrovli bo'lishi uchun ataylab
// bo'sh emas naqshlar.
const SUBSCRIPTION_RE = /(obuna\s*bo['’]?ling|обязательн\w*\s*подпи|подпиш[а-я]*тесь|join\s*(the\s*)?channel)/i;
const QUOTA_RE = /(kunlik\s*limit|limit\s*tugad|лимит\s*исчерп|баланс\s*(законч|исчерп)|balans\s*tugad)/i;
const NOT_FOUND_RE = /(topilmadi|не\s*найден[а-я]*|hech\s*narsa\s*topilmadi|ничего\s*не\s*найдено)/i;
const JOIN_BUTTON_RE = /(obuna|a['’]?zo\s*bo['’]?l|подпис|join)/i;
const MENU_BUTTON_RE = /(qidir|search|topish|raqam\s*qidir|поиск|номер)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(base) {
  return base + Math.random() * (base * 0.25);
}

function messageText(message) {
  return message?.message || '';
}

function inlineButtons(message) {
  const rows = message?.replyMarkup?.rows || [];
  return rows.flatMap((row) => row.buttons || []);
}

function hasJoinButton(message) {
  return inlineButtons(message).some((b) => JOIN_BUTTON_RE.test(b.text || ''));
}

function findMenuButton(message) {
  return inlineButtons(message).find(
    (b) => b.className === 'KeyboardButtonCallback' && MENU_BUTTON_RE.test(b.text || '')
  );
}

async function resolveBot(client, botUsername) {
  const resolved = await client.invoke(new Api.contacts.ResolveUsername({ username: botUsername }));
  const user = resolved.users?.[0];
  if (!user) {
    throw new Error(`Bot topilmadi: @${botUsername}`);
  }
  const inputPeer = new Api.InputPeerUser({ userId: user.id, accessHash: user.accessHash });
  return { user, inputPeer };
}

async function fetchLastMessage(client, inputPeer) {
  const history = await client.invoke(
    new Api.messages.GetHistory({
      peer: inputPeer,
      limit: 1,
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      maxId: 0,
      minId: 0,
      hash: 0n,
    })
  );
  return history.messages?.[0] || null;
}

function randomId() {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
}

async function sendText(client, inputPeer, text) {
  await client.invoke(new Api.messages.SendMessage({ peer: inputPeer, message: text, randomId: randomId() }));
}

async function pressMenuButtonIfPresent(client, inputPeer, message) {
  const button = message && findMenuButton(message);
  if (!button) return false;
  await client.invoke(
    new Api.messages.GetBotCallbackAnswer({ peer: inputPeer, msgId: message.id, data: button.data })
  );
  return true;
}

function classifyMessage(message) {
  const text = messageText(message);
  if (SUBSCRIPTION_RE.test(text) || hasJoinButton(message)) {
    return { kind: 'subscription', text };
  }
  if (QUOTA_RE.test(text)) {
    return { kind: 'quota', text };
  }
  if (NOT_FOUND_RE.test(text)) {
    return { kind: 'not_found', text };
  }
  return { kind: 'unknown', text };
}

// Botdan javobni kutadi: NewMessage VA MessageEdited ikkalasi ham
// tinglanadi (ba'zi botlar "⏳ Qidirilmoqda..." yuborib, keyin O'SHA
// xabarni tahrirlaydi). Parser "yakuniy emas" desa (masalan oraliq holat
// xabari), keyingi xabar kutiladi — ko'pi bilan `maxIntermediates` ta.
function waitForBotReply(client, user, { timeoutMs, isFinal, maxIntermediates }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let intermediateCount = 0;
    let timer = null;

    const newMsgFilter = new NewMessage({ fromUsers: [user.id] });
    const editFilter = new EditedMessage({ fromUsers: [user.id] });

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.primaryClient.removeEventHandler(onEvent, newMsgFilter);
      client.primaryClient.removeEventHandler(onEvent, editFilter);
    };

    const finish = (result) => {
      cleanup();
      resolve(result);
    };
    const fail = (err) => {
      cleanup();
      reject(err);
    };

    timer = setTimeout(() => fail(new LookupTimeoutError()), timeoutMs);

    function onEvent(event) {
      if (settled) return;
      const message = event?.message;
      if (!message) return;

      const classified = classifyMessage(message);
      if (classified.kind === 'subscription') {
        return fail(new LookupSubscriptionRequiredError(classified.text));
      }
      if (classified.kind === 'quota') {
        return fail(new LookupQuotaExhaustedError(classified.text));
      }
      if (classified.kind === 'not_found') {
        return finish({ text: classified.text, raw: message, code: 'LOOKUP_NOT_FOUND' });
      }

      if (isFinal(classified.text)) {
        return finish({ text: classified.text, raw: message });
      }

      // Oraliq (masalan "⏳ Qidirilmoqda...") xabar — tashlab yuboriladi,
      // keyingisi kutiladi. Limitdan oshsa, tanilmagan bo'lsa ham oxirgi
      // xabarni "yakuniy" deb qabul qilamiz (chaqiruvchi raw_response'ga
      // yozib qo'yadi, keyin real javoblar asosida parser sozlanadi).
      intermediateCount += 1;
      if (intermediateCount >= maxIntermediates) {
        return finish({ text: classified.text, raw: message, unrecognized: true });
      }
    }

    client.primaryClient.addEventHandler(onEvent, newMsgFilter);
    client.primaryClient.addEventHandler(onEvent, editFilter);
  });
}

async function performAsk(client, botUsername, query, opts) {
  const { user, inputPeer } = await resolveBot(client, botUsername);

  const last = await fetchLastMessage(client, inputPeer);
  if (!last) {
    // Dialog yo'q — avval /start yuboriladi, uning javobidan menyu
    // tugmasini qidiramiz.
    await sendText(client, inputPeer, '/start');
    const startReply = await waitForBotReply(client, user, {
      timeoutMs: opts.timeoutMs,
      isFinal: () => true,
      maxIntermediates: 1,
    }).catch(() => null);
    if (startReply) await pressMenuButtonIfPresent(client, inputPeer, startReply.raw);
  } else {
    await pressMenuButtonIfPresent(client, inputPeer, last);
  }

  await sendText(client, inputPeer, query);
  return waitForBotReply(client, user, {
    timeoutMs: opts.timeoutMs,
    isFinal: opts.isFinal,
    maxIntermediates: opts.maxIntermediates,
  });
}

// LOOKUP_TIMEOUT bo'lsa (va faqat shu holatda) eksponensial backoff bilan
// qayta uriniladi — obuna/limit/topilmadi qayta urinish bilan tuzalmaydi,
// shuning uchun ular darhol tashlanadi.
async function askWithRetry(client, botUsername, query, opts) {
  const maxRetries = opts.timeoutRetries;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await performAsk(client, botUsername, query, opts);
    } catch (err) {
      if (err.code !== 'LOOKUP_TIMEOUT' || attempt === maxRetries) throw err;
      lastErr = err;
      await sleep(backoffDelayMs(attempt));
    }
  }
  throw lastErr;
}

// Navbat: barcha so'rovlar KETMA-KET ishlaydi (parallel emas) — bitta
// modul-darajasidagi promise zanjiri orqali. Har chaqiruv navbatdagi
// o'rnini kutadi, so'ng min-interval+jitter kutadi, so'ng daqiqalik
// cap'ni tekshiradi.
let queueTail = Promise.resolve();
const callTimestamps = [];

async function waitForSlot(maxPerMinute) {
  const now = Date.now();
  while (callTimestamps.length > 0 && now - callTimestamps[0] > 60_000) callTimestamps.shift();
  if (callTimestamps.length >= maxPerMinute) {
    const waitMs = 60_000 - (now - callTimestamps[0]) + 50;
    await sleep(waitMs);
    return waitForSlot(maxPerMinute);
  }
}

async function runQueued(client, botUsername, query, opts) {
  await waitForSlot(opts.maxPerMinute);
  await sleep(jitter(opts.minIntervalMs));
  callTimestamps.push(Date.now());
  return askWithRetry(client, botUsername, query, opts);
}

/**
 * Botga so'rov yuborib javobini kutadi. `client` — src/telegram/client.js
 * dagi pool (`.invoke()` va `.primaryClient` bilan): amaliy chaqiruvlar
 * (resolve/send/callback) `pool.invoke()` orqali o'tadi, shuning uchun
 * FloodWaitError'ni RateLimitedSession.invoke() ALLAQACHON mavjud
 * mexanizmi bilan avtomatik ushlab boshqaradi — bu yerda alohida kod
 * kerak emas. Faqat javobni real-vaqtda tinglash (`addEventHandler`)
 * `primaryClient` orqali — bu so'rov emas, push-update, rate-limit
 * qamrovidan tashqarida.
 *
 * @returns {Promise<{text: string, raw: object, code?: string}>}
 */
export async function ask(client, botUsername, query, opts = {}) {
  const finalOpts = {
    timeoutMs: opts.timeoutMs ?? config.lookup.botTimeoutMs,
    minIntervalMs: opts.minIntervalMs ?? config.lookup.minIntervalMs,
    maxPerMinute: opts.maxPerMinute ?? 15,
    maxIntermediates: opts.maxIntermediates ?? 3,
    timeoutRetries: opts.timeoutRetries ?? 3,
    isFinal: opts.isFinal || (() => true),
  };

  const runPromise = queueTail.then(() => runQueued(client, botUsername, query, finalOpts));
  // Xato bo'lsa ham navbat davom etishi kerak — keyingi so'rov oldingisining
  // xatosi bilan bloklanib qolmasin.
  queueTail = runPromise.then(
    () => {},
    () => {}
  );
  return runPromise;
}

export default { ask, LookupBridgeError, LookupSubscriptionRequiredError, LookupQuotaExhaustedError, LookupTimeoutError };
