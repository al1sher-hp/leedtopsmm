import { describe, it, expect, vi } from 'vitest';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import {
  ask,
  LookupSubscriptionRequiredError,
  LookupQuotaExhaustedError,
  LookupTimeoutError,
} from '../src/lookup/bridge/botBridge.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Belgilangan shart to'g'ri bo'lguncha qisqa oraliqlar bilan tekshiradi —
// qattiq belgilangan sleep() o'rniga, retry testida ikkinchi urinishning
// TOR (30ms) timeout oynasiga aniq tushish uchun ishlatiladi.
async function waitUntil(predicate, { intervalMs = 5, maxMs = 3000 } = {}) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > maxMs) throw new Error('waitUntil: kutish muddati tugadi');
    await sleep(intervalMs);
  }
}

// GramJS'ga haqiqiy ulanmasdan botBridge'ni sinash uchun mock client:
// `.invoke()` so'rov turiga qarab qo'lda tayyorlangan javob qaytaradi,
// `.primaryClient.addEventHandler()` esa ro'yxatdan o'tgan handler'larni
// ushlab qoladi — test ularni qo'lda chaqirib, "bot javob berdi"ni
// simulyatsiya qiladi.
function makeMockClient({ hasHistory = true, lastMessage } = {}) {
  const newMessageHandlers = [];
  const editedMessageHandlers = [];

  const invoke = vi.fn(async (request) => {
    if (request.className === 'contacts.ResolveUsername') {
      return { users: [{ id: 999n, accessHash: 1n, className: 'User' }] };
    }
    if (request.className === 'messages.GetHistory') {
      return { messages: hasHistory ? [lastMessage || { id: 1, message: 'salom', out: false }] : [] };
    }
    if (request.className === 'messages.SendMessage') {
      return true;
    }
    if (request.className === 'messages.GetBotCallbackAnswer') {
      return true;
    }
    throw new Error(`kutilmagan so'rov: ${request.className}`);
  });

  const primaryClient = {
    // DIQQAT: GramJS'da `EditedMessage extends NewMessage` — shuning uchun
    // `instanceof NewMessage` ikkalasiga ham true beradi. Aniqroq (subclass)
    // tekshiruv AVVAL bo'lishi shart.
    addEventHandler: vi.fn((handler, filter) => {
      if (filter instanceof EditedMessage) editedMessageHandlers.push(handler);
      else newMessageHandlers.push(handler);
    }),
    removeEventHandler: vi.fn(),
  };

  return { client: { invoke, primaryClient }, newMessageHandlers, editedMessageHandlers };
}

const FAST_OPTS = { minIntervalMs: 0, maxPerMinute: 1000, timeoutMs: 300 };

describe('ask — normal javob', () => {
  it("bot javob berganda { text, raw } qaytaradi", async () => {
    const { client, newMessageHandlers } = makeMockClient();
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await sleep(20);
    expect(newMessageHandlers.length).toBeGreaterThan(0);
    newMessageHandlers[0]({ message: { id: 2, message: "Ism: John\nTelefon: +998901234567", out: false } });

    const result = await promise;
    expect(result.text).toContain('John');
    expect(result.raw.id).toBe(2);
  });
});

describe('ask — tahrirlangan xabar', () => {
  it('MessageEdited orqali kelgan javobni ham qabul qiladi (bot avval "..." yuborib, keyin tahrirlaydi)', async () => {
    const { client, editedMessageHandlers } = makeMockClient();
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await sleep(20);
    expect(editedMessageHandlers.length).toBeGreaterThan(0);
    editedMessageHandlers[0]({ message: { id: 2, message: 'Tahrirlangan yakuniy javob', out: false } });

    const result = await promise;
    expect(result.text).toBe('Tahrirlangan yakuniy javob');
  });
});

describe('ask — oraliq "qidirilmoqda" xabari', () => {
  it("parser tanimagan (yakuniy bo'lmagan) xabarni tashlab, keyingisini kutadi", async () => {
    const { client, newMessageHandlers } = makeMockClient();
    const isFinal = (text) => !/qidirilmoqda/i.test(text);
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal });

    await sleep(20);
    newMessageHandlers[0]({ message: { id: 2, message: '⏳ Qidirilmoqda...', out: false } });
    await sleep(10);
    newMessageHandlers[0]({ message: { id: 3, message: 'Telefon: +998901234567', out: false } });

    const result = await promise;
    expect(result.text).toContain('+998901234567');
    expect(result.raw.id).toBe(3);
  });

  it("maksimal oraliq xabar sonidan (3) oshsa, oxirgi xabarni 'tanilmagan' deb qabul qiladi", async () => {
    const { client, newMessageHandlers } = makeMockClient();
    const isFinal = () => false; // hech qachon yakuniy emas
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal, maxIntermediates: 3 });

    await sleep(20);
    newMessageHandlers[0]({ message: { id: 2, message: 'xabar1', out: false } });
    await sleep(5);
    newMessageHandlers[0]({ message: { id: 3, message: 'xabar2', out: false } });
    await sleep(5);
    newMessageHandlers[0]({ message: { id: 4, message: 'xabar3', out: false } });

    const result = await promise;
    expect(result.unrecognized).toBe(true);
    expect(result.raw.id).toBe(4);
  });
});

describe('ask — obuna talabi', () => {
  it('"obuna bo\'ling" matnini ko\'rsa LookupSubscriptionRequiredError tashlaydi', async () => {
    const { client, newMessageHandlers } = makeMockClient();
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await sleep(20);
    newMessageHandlers[0]({ message: { id: 2, message: "Avval kanalimizga obuna bo'ling!", out: false } });

    await expect(promise).rejects.toBeInstanceOf(LookupSubscriptionRequiredError);
  });

  it('join tugmasi bo\'lsa ham (matn boshqacha bo\'lsa ham) obuna sifatida tanийdi', async () => {
    const { client, newMessageHandlers } = makeMockClient();
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await sleep(20);
    newMessageHandlers[0]({
      message: {
        id: 2,
        message: 'Davom etish uchun quyidagi tugmani bosing',
        out: false,
        replyMarkup: { rows: [{ buttons: [{ className: 'KeyboardButtonUrl', text: "Obuna bo'lish" }] }] },
      },
    });

    await expect(promise).rejects.toBeInstanceOf(LookupSubscriptionRequiredError);
  });
});

describe('ask — limit', () => {
  it('"kunlik limit tugadi" matnini ko\'rsa LookupQuotaExhaustedError tashlaydi', async () => {
    const { client, newMessageHandlers } = makeMockClient();
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await sleep(20);
    newMessageHandlers[0]({ message: { id: 2, message: "Sizning kunlik limit tugadi", out: false } });

    await expect(promise).rejects.toBeInstanceOf(LookupQuotaExhaustedError);
  });
});

describe('ask — timeout', () => {
  it('hech qanday javob kelmasa LookupTimeoutError bilan tugaydi', async () => {
    const { client } = makeMockClient();
    await expect(
      ask(client, 'testbot', 'query', { ...FAST_OPTS, timeoutMs: 30, timeoutRetries: 0, isFinal: () => true })
    ).rejects.toBeInstanceOf(LookupTimeoutError);
  });
});

describe('ask — retry', () => {
  it("LOOKUP_TIMEOUT bo'lganda qayta uriniladi, ikkinchi urinish muvaffaqiyatli bo'lsa natija qaytadi", async () => {
    const { client, newMessageHandlers } = makeMockClient();

    const promise = ask(client, 'testbot', 'query', {
      ...FAST_OPTS,
      timeoutMs: 30,
      timeoutRetries: 1,
      isFinal: () => true,
    });

    // Birinchi urinish hech qanday javobsiz timeout bo'ladi (~30ms) + backoff
    // (backoffDelayMs(0) = 1000ms) kutiladi, keyin ikkinchi urinish boshlanadi.
    // Ikkinchi urinishning o'zi ham TOR (30ms) timeout oynasiga ega bo'lgani
    // uchun ro'yxatdan o'tishi bilanoq (qattiq sleep emas, tez polling bilan)
    // javob yuboriladi.
    await waitUntil(() => newMessageHandlers.length >= 2, { maxMs: 5000 });
    newMessageHandlers[newMessageHandlers.length - 1]({
      message: { id: 5, message: 'ikkinchi urinishda topildi', out: false },
    });

    const result = await promise;
    expect(result.text).toBe('ikkinchi urinishda topildi');
  }, 10_000);
});

describe('ask — ketma-ketlik (parallel chaqiruv bo\'lmasligi)', () => {
  it('ikkinchi so\'rov birinchisi tugaguncha boshlanmaydi', async () => {
    const { client, newMessageHandlers } = makeMockClient();

    const p1 = ask(client, 'testbot', 'query1', { ...FAST_OPTS, isFinal: () => true });
    await sleep(20);
    const invokeCountAfterFirst = client.invoke.mock.calls.length;
    expect(invokeCountAfterFirst).toBeGreaterThan(0);

    const p2 = ask(client, 'testbot', 'query2', { ...FAST_OPTS, isFinal: () => true });
    await sleep(20);
    // p2 hali navbatda kutmoqda — client.invoke soni o'zgarmagan bo'lishi kerak
    expect(client.invoke.mock.calls.length).toBe(invokeCountAfterFirst);

    // birinchi so'rovga javob beramiz
    newMessageHandlers[0]({ message: { id: 2, message: 'javob1', out: false } });
    const r1 = await p1;
    expect(r1.text).toBe('javob1');

    // endi ikkinchi so'rov boshlanishi kerak
    await sleep(20);
    expect(client.invoke.mock.calls.length).toBeGreaterThan(invokeCountAfterFirst);

    newMessageHandlers[newMessageHandlers.length - 1]({ message: { id: 3, message: 'javob2', out: false } });
    const r2 = await p2;
    expect(r2.text).toBe('javob2');
  });
});

describe("ask — darhol (sinxron) javob race condition", () => {
  it("tinglovchi SendMessage yuborilishidan OLDIN ulanadi, shuning uchun sendText() qaytishidan OLDIN kelgan javobni ham o'tkazib yubormaydi", async () => {
    const newMessageHandlers = [];
    let handlersRegisteredBeforeSend = null;

    const invoke = vi.fn(async (request) => {
      if (request.className === 'contacts.ResolveUsername') {
        return { users: [{ id: 999n, accessHash: 1n, className: 'User' }] };
      }
      if (request.className === 'messages.GetHistory') {
        return { messages: [{ id: 1, message: 'salom', out: false }] };
      }
      if (request.className === 'messages.SendMessage') {
        // Bot javobni sendText()NING O'ZI hali qaytmasdan, SINXRON ravishda
        // yuboradi — bu ESKI (buggy) kodda hech kimga yetib bormas edi,
        // chunki tinglovchi faqat sendText() qaytgandan KEYIN ulanardi.
        handlersRegisteredBeforeSend = newMessageHandlers.length;
        if (newMessageHandlers.length > 0) {
          newMessageHandlers[newMessageHandlers.length - 1]({
            message: { id: 99, message: 'darhol javob', out: false },
          });
        }
        return true;
      }
      throw new Error(`kutilmagan so'rov: ${request.className}`);
    });

    const primaryClient = {
      addEventHandler: vi.fn((handler, filter) => {
        if (!(filter instanceof EditedMessage)) newMessageHandlers.push(handler);
      }),
      removeEventHandler: vi.fn(),
    };
    const client = { invoke, primaryClient };

    const result = await ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    expect(handlersRegisteredBeforeSend).toBeGreaterThan(0);
    expect(result.text).toBe('darhol javob');
  });
});

describe("ask — menyu tugmasi faqat yangi /start javobida bosiladi", () => {
  it("mavjud dialogning OXIRGI xabaridagi tugma bosilmaydi (oldingi so'rov natijasi bo'lishi mumkin)", async () => {
    const staleMessage = {
      id: 1,
      message: 'Eski (oldingi so\'rovga tegishli) javob',
      out: false,
      replyMarkup: {
        rows: [{ buttons: [{ className: 'KeyboardButtonCallback', text: 'Qidirish', data: Buffer.from('x') }] }],
      },
    };
    const { client, newMessageHandlers } = makeMockClient({ hasHistory: true, lastMessage: staleMessage });
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await sleep(20);
    newMessageHandlers[0]({ message: { id: 2, message: 'yangi javob', out: false } });
    await promise;

    const callbackCalls = client.invoke.mock.calls.filter((c) => c[0].className === 'messages.GetBotCallbackAnswer');
    expect(callbackCalls).toHaveLength(0);
  });

  it("yangi dialogning /start javobidagi menyu tugmasi BOSILADI", async () => {
    const { client, newMessageHandlers } = makeMockClient({ hasHistory: false });
    const promise = ask(client, 'testbot', 'query', { ...FAST_OPTS, isFinal: () => true });

    await waitUntil(() => newMessageHandlers.length >= 1);
    newMessageHandlers[0]({
      message: {
        id: 2,
        message: 'Xush kelibsiz!',
        out: false,
        replyMarkup: {
          rows: [{ buttons: [{ className: 'KeyboardButtonCallback', text: 'Qidirish', data: Buffer.from('go') }] }],
        },
      },
    });

    await waitUntil(() => newMessageHandlers.length >= 2);
    newMessageHandlers[newMessageHandlers.length - 1]({ message: { id: 3, message: 'natija', out: false } });

    const result = await promise;
    expect(result.text).toBe('natija');

    const callbackCalls = client.invoke.mock.calls.filter((c) => c[0].className === 'messages.GetBotCallbackAnswer');
    expect(callbackCalls).toHaveLength(1);
    expect(callbackCalls[0][0].msgId).toBe(2);
  });
});
