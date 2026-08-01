import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/models.js', () => {
  let contacts = [];
  const DialogContact = {
    findAll: vi.fn(async () => contacts),
    __setContacts: (list) => {
      contacts = list;
    },
  };
  const JobRun = {
    create: vi.fn(async (fields) => {
      const job = { id: 1, ...fields };
      job.update = vi.fn(async (f) => Object.assign(job, f));
      return job;
    }),
  };
  return { DialogContact, JobRun };
});

vi.mock('../src/score/gemini.js', () => ({
  verifyPremiumInterest: vi.fn(async () => ({ interested: true, reason: 'mock' })),
}));

const { DialogContact } = await import('../src/db/models.js');
const { verifyPremiumInterest } = await import('../src/score/gemini.js');
const { runDialogsClassify, classifyOneContact, messageMatchesKeywords } = await import('../src/dialogs/classify.js');

function makeContact(overrides = {}) {
  const contact = {
    id: 1,
    tg_user_id: '1',
    opted_out: false,
    premium_mentions: 0,
    classified_at: null,
    ai_rejected: false,
    ...overrides,
  };
  contact.update = vi.fn(async (fields) => Object.assign(contact, fields));
  return contact;
}

function makeMessage(id, out, text) {
  return { id, out, message: text };
}

function makePool(messagesByPeer) {
  return {
    primaryClient: { getInputEntity: vi.fn(async (id) => ({ id })) },
    invoke: vi.fn(async (request) => ({ messages: messagesByPeer[request.peer.id] || [] })),
  };
}

function makeJob() {
  return { update: vi.fn(async () => {}), params_json: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('messageMatchesKeywords — so\'z chegarasi', () => {
  it('"premiumniki" kabi ichiga singib ketgan holatga mos kelmaydi', () => {
    expect(messageMatchesKeywords('premiumniki mahsulot yaxshi', ['premium'])).toBe(false);
  });

  it('"Premium" (katta harf, alohida so\'z) mos keladi', () => {
    expect(messageMatchesKeywords('Premium sotib olsam boladimi?', ['premium'])).toBe(true);
  });

  it('kirill kalit so\'z ("премиум") ham so\'z chegarasi bilan ishlaydi', () => {
    expect(messageMatchesKeywords('премиум обунани сотиб олдим', ['премиум'])).toBe(true);
    expect(messageMatchesKeywords('премиумчик degan narsa', ['премиум'])).toBe(false);
  });

  it("matn bo'sh yoki null bo'lsa false qaytaradi", () => {
    expect(messageMatchesKeywords('', ['premium'])).toBe(false);
    expect(messageMatchesKeywords(null, ['premium'])).toBe(false);
  });
});

describe('classifyOneContact — faqat kiruvchi xabarlar', () => {
  it('out=true (bizning xabarimiz) hisobga olinmaydi', async () => {
    const pool = makePool({
      1: [
        makeMessage(1, true, 'Premium sotib oling, chegirma bor!'), // biz yozgan — hisobga olinmaydi
        makeMessage(2, false, 'Salom, qalesiz?'),
      ],
    });
    const contact = makeContact({ tg_user_id: '1' });

    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 1, aiVerify: false, messageLimit: 300 });

    expect(result.mentions).toBe(0);
    expect(contact.premium_mentions).toBe(0);
  });

  it('faqat suhbatdoshning (out=false) xabarlari sanaladi', async () => {
    const pool = makePool({
      1: [
        makeMessage(1, false, 'Premium haqida so\'ramoqchi edim'),
        makeMessage(2, true, 'Premium haqida ma\'lumot bering'),
        makeMessage(3, false, 'tag premium narxi qancha'),
      ],
    });
    const contact = makeContact({ tg_user_id: '1' });

    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 1, aiVerify: false, messageLimit: 300 });

    expect(result.mentions).toBe(2);
  });
});

describe('classifyOneContact — bitta xabarda takrorlangan so\'z', () => {
  it("bitta xabarda kalit so'z necha marta uchrashidan qat'i nazar 1 deb sanaladi", async () => {
    const pool = makePool({
      1: [makeMessage(1, false, 'premium premium premium kerak edi')],
    });
    const contact = makeContact({ tg_user_id: '1' });

    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 1, aiVerify: false, messageLimit: 300 });

    expect(result.mentions).toBe(1);
  });
});

describe('classifyOneContact — threshold chegarasi', () => {
  it('mentions=2, threshold=3 -> matched=false', async () => {
    const pool = makePool({
      1: [
        makeMessage(1, false, 'premium kerak'),
        makeMessage(2, false, 'premium narxi qancha'),
      ],
    });
    const contact = makeContact({ tg_user_id: '1' });
    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 3, aiVerify: false, messageLimit: 300 });
    expect(result.mentions).toBe(2);
    expect(result.matched).toBe(false);
  });

  it('mentions=3, threshold=3 -> matched=true', async () => {
    const pool = makePool({
      1: [
        makeMessage(1, false, 'premium kerak'),
        makeMessage(2, false, 'premium narxi qancha'),
        makeMessage(3, false, 'premium olmoqchiman'),
      ],
    });
    const contact = makeContact({ tg_user_id: '1' });
    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 3, aiVerify: false, messageLimit: 300 });
    expect(result.mentions).toBe(3);
    expect(result.matched).toBe(true);
  });
});

describe('classifyOneContact — AI tekshiruv faqat threshold\'dan o\'tganlarga', () => {
  it('mentions < threshold bo\'lsa Gemini chaqirilmaydi', async () => {
    const pool = makePool({ 1: [makeMessage(1, false, 'premium kerak')] });
    const contact = makeContact({ tg_user_id: '1' });
    await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 3, aiVerify: true, messageLimit: 300 });
    expect(verifyPremiumInterest).not.toHaveBeenCalled();
    expect(contact.ai_rejected).toBe(false);
  });

  it("mentions >= threshold va aiVerify=true bo'lsa Gemini chaqiriladi", async () => {
    const pool = makePool({
      1: [
        makeMessage(1, false, 'premium kerak'),
        makeMessage(2, false, 'premium narxi'),
        makeMessage(3, false, 'premium olaman'),
      ],
    });
    const contact = makeContact({ tg_user_id: '1' });
    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 3, aiVerify: true, messageLimit: 300 });
    expect(verifyPremiumInterest).toHaveBeenCalledTimes(1);
    expect(result.aiChecked).toBe(true);
  });

  it('Gemini "yo\'q" (interested:false) desa ai_rejected=true bo\'ladi, premium_mentions saqlanadi', async () => {
    verifyPremiumInterest.mockResolvedValueOnce({ interested: false, reason: 'boshqa mavzu' });
    const pool = makePool({
      1: [
        makeMessage(1, false, 'premium kerak'),
        makeMessage(2, false, 'premium narxi'),
        makeMessage(3, false, 'premium olaman'),
      ],
    });
    const contact = makeContact({ tg_user_id: '1' });
    const result = await classifyOneContact(pool, contact, { keywords: ['premium'], threshold: 3, aiVerify: true, messageLimit: 300 });

    expect(result.aiRejected).toBe(true);
    expect(contact.ai_rejected).toBe(true);
    expect(contact.premium_mentions).toBe(3); // saqlanadi, o'chirilmaydi
  });
});

describe('runDialogsClassify — opted_out chetlab o\'tilishi', () => {
  it("DialogContact.findAll opted_out=false filtri bilan chaqiriladi", async () => {
    DialogContact.__setContacts([]);
    const pool = makePool({});
    await runDialogsClassify(pool, makeJob(), { keywords: ['premium'], threshold: 3, aiVerify: false });

    expect(DialogContact.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { opted_out: false } })
    );
  });

  it("faqat DB'dan qaytgan (allaqachon opted_out=false bo'lgan) kontaktlarni qayta ishlaydi", async () => {
    const contact = makeContact({ tg_user_id: '5' });
    DialogContact.__setContacts([contact]);
    const pool = makePool({ 5: [makeMessage(1, false, 'premium kerak')] });

    const stats = await runDialogsClassify(pool, makeJob(), { keywords: ['premium'], threshold: 1, aiVerify: false });

    expect(stats.scanned).toBe(1);
    expect(contact.premium_mentions).toBe(1);
  });
});
