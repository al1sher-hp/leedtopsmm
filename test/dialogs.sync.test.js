import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Api } from 'telegram';

// DialogContact/JobRun'ning sodda xotiradagi mock'i — haqiqiy Postgres'siz
// upsert/dedup/opted_out xatti-harakatini tekshirish uchun. `__store`/`__reset`
// orqali test ichidan holatga to'g'ridan-to'g'ri kirish mumkin.
vi.mock('../src/db/models.js', () => {
  const store = new Map();
  let nextId = 1;

  function wrap(row) {
    return { ...row, update: async (fields) => Object.assign(row, fields) };
  }

  const DialogContact = {
    findOne: vi.fn(async ({ where: { tg_user_id } }) => {
      const row = store.get(tg_user_id);
      return row ? wrap(row) : null;
    }),
    create: vi.fn(async (fields) => {
      const row = { id: nextId++, opted_out: false, ...fields };
      store.set(fields.tg_user_id, row);
      return wrap(row);
    }),
    __store: store,
    __reset: () => {
      store.clear();
      nextId = 1;
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

const { DialogContact } = await import('../src/db/models.js');
const { runDialogsSync, upsertDialogContact } = await import('../src/dialogs/sync.js');

function makeUser({ id, username = null, firstName = null, lastName = null, phone = null, bot = false, premium = false, contact = false, mutualContact = false, accessHash = 1n }) {
  return new Api.User({
    id: BigInt(id),
    accessHash,
    username,
    firstName,
    lastName,
    phone,
    bot,
    premium,
    contact,
    mutualContact,
  });
}

function makeMessage({ id, date, out = false }) {
  return new Api.Message({ id, date, out, message: '' });
}

function makeUserDialog({ userId, topMessage }) {
  return new Api.Dialog({
    peer: new Api.PeerUser({ userId: BigInt(userId) }),
    topMessage,
    readInboxMaxId: 0,
    readOutboxMaxId: 0,
    unreadCount: 0,
    unreadMentionsCount: 0,
    unreadReactionsCount: 0,
    notifySettings: new Api.PeerNotifySettings({}),
  });
}

function makeChannel({ id, accessHash = 1n }) {
  return new Api.Channel({
    id: BigInt(id),
    accessHash,
    title: `kanal-${id}`,
    photo: new Api.ChatPhotoEmpty({}),
    date: 0,
  });
}

function makeChannelDialog({ channelId, topMessage }) {
  return new Api.Dialog({
    peer: new Api.PeerChannel({ channelId: BigInt(channelId) }),
    topMessage,
    readInboxMaxId: 0,
    readOutboxMaxId: 0,
    unreadCount: 0,
    unreadMentionsCount: 0,
    unreadReactionsCount: 0,
    notifySettings: new Api.PeerNotifySettings({}),
  });
}

function makeJob() {
  return { update: vi.fn(async () => {}) };
}

beforeEach(() => {
  DialogContact.__reset();
  vi.clearAllMocks();
});

describe('runDialogsSync — sahifalash', () => {
  it("to'liq sahifadan keyin ikkinchi so'rov yuboradi, cursor'ni to'g'ri hisoblab", async () => {
    const page1Users = Array.from({ length: 100 }, (_, i) => makeUser({ id: i + 1 }));
    const page1Messages = Array.from({ length: 100 }, (_, i) => makeMessage({ id: i + 1, date: 1000 + i }));
    const page1Dialogs = page1Users.map((u, i) => makeUserDialog({ userId: u.id, topMessage: page1Messages[i].id }));

    const page2Users = [makeUser({ id: 201 }), makeUser({ id: 202 }), makeUser({ id: 203 })];
    const page2Messages = page2Users.map((u, i) => makeMessage({ id: 200 + i, date: 500 + i }));
    const page2Dialogs = page2Users.map((u, i) => makeUserDialog({ userId: u.id, topMessage: page2Messages[i].id }));

    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ dialogs: page1Dialogs, users: page1Users, chats: [], messages: page1Messages })
      .mockResolvedValueOnce({ dialogs: page2Dialogs, users: page2Users, chats: [], messages: page2Messages });

    const pool = { invoke };
    const job = makeJob();

    const stats = await runDialogsSync(pool, job, { limit: 103 });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(stats.scanned).toBe(103);
    expect(stats.created).toBe(103);
    expect(DialogContact.__store.size).toBe(103);

    // Ikkinchi chaqiruv cursor'i birinchi sahifaning OXIRGI dialogidan olingan
    const secondRequest = invoke.mock.calls[1][0];
    expect(secondRequest.offsetId).toBe(page1Dialogs[99].topMessage);
    expect(secondRequest.offsetDate).toBe(page1Messages[99].date);
    expect(secondRequest.limit).toBe(3);
  });

  it("dialoglar tugaganda (bo'sh javob) to'xtaydi", async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ dialogs: [], users: [], chats: [], messages: [] });
    const stats = await runDialogsSync({ invoke }, makeJob(), { limit: 500 });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(stats.scanned).toBe(0);
  });
});

describe('runDialogsSync — faqat User tipi', () => {
  it('kanal/guruh dialoglarini o\'tkazib yuboradi, faqat PeerUser yoziladi', async () => {
    const user = makeUser({ id: 10, firstName: 'Ali' });
    const userMsg = makeMessage({ id: 1, date: 1000 });
    const userDialog = makeUserDialog({ userId: 10, topMessage: 1 });

    const channel = makeChannel({ id: 20 });
    const channelMsg = makeMessage({ id: 2, date: 999 });
    const channelDialog = makeChannelDialog({ channelId: 20, topMessage: 2 });

    const invoke = vi.fn().mockResolvedValueOnce({
      dialogs: [userDialog, channelDialog],
      users: [user],
      chats: [channel],
      messages: [userMsg, channelMsg],
    });

    const stats = await runDialogsSync({ invoke }, makeJob(), { limit: 500 });

    expect(stats.scanned).toBe(1);
    expect(stats.created).toBe(1);
    expect(DialogContact.__store.size).toBe(1);
    expect(DialogContact.__store.has('10')).toBe(true);
    expect(DialogContact.__store.has('20')).toBe(false);
  });

  it('bot bo\'lgan foydalanuvchilarni HAM yozadi (is_bot orqali belgilab)', async () => {
    const botUser = makeUser({ id: 55, bot: true, username: 'somebot' });
    const msg = makeMessage({ id: 1, date: 1000 });
    const dialog = makeUserDialog({ userId: 55, topMessage: 1 });

    const invoke = vi.fn().mockResolvedValueOnce({ dialogs: [dialog], users: [botUser], chats: [], messages: [msg] });
    await runDialogsSync({ invoke }, makeJob(), { limit: 500 });

    const row = DialogContact.__store.get('55');
    expect(row).toBeTruthy();
    expect(row.is_bot).toBe(true);
  });
});

describe('upsertDialogContact — upsert (dublikat yaratmasligi)', () => {
  it('bir xil tg_user_id ikkinchi marta chaqirilganda yangi yozuv yaratmaydi, mavjudini yangilaydi', async () => {
    const stats = { scanned: 0, created: 0, updated: 0, skipped_opted_out: 0, failed: 0 };
    const user1 = makeUser({ id: 7, firstName: 'Birinchi' });
    await upsertDialogContact(user1, { lastMessageAt: new Date('2026-01-01') }, stats);

    const user2 = makeUser({ id: 7, firstName: 'Ikkinchi' });
    await upsertDialogContact(user2, { lastMessageAt: new Date('2026-02-01') }, stats);

    expect(DialogContact.__store.size).toBe(1);
    expect(stats.created).toBe(1);
    expect(stats.updated).toBe(1);
    expect(DialogContact.__store.get('7').first_name).toBe('Ikkinchi');
  });
});

describe('upsertDialogContact — opted_out himoyasi', () => {
  it('opted_out=true bo\'lgan mavjud yozuvning hech qanday maydonini o\'zgartirmaydi', async () => {
    DialogContact.__store.set('99', {
      id: 1,
      tg_user_id: '99',
      first_name: 'ESKI',
      is_premium: false,
      opted_out: true,
      phone: null,
    });

    const stats = { scanned: 0, created: 0, updated: 0, skipped_opted_out: 0, failed: 0 };
    const user = makeUser({ id: 99, firstName: 'YANGI', premium: true, phone: '998901234567' });

    await upsertDialogContact(user, { lastMessageAt: new Date() }, stats);

    const row = DialogContact.__store.get('99');
    expect(row.first_name).toBe('ESKI');
    expect(row.is_premium).toBe(false);
    expect(row.phone).toBeNull();
    expect(stats.skipped_opted_out).toBe(1);
    expect(stats.updated).toBe(0);
  });

  it("opted_out=false bo'lgan mavjud yozuvni normal yangilaydi", async () => {
    DialogContact.__store.set('100', {
      id: 2,
      tg_user_id: '100',
      first_name: 'ESKI',
      opted_out: false,
    });

    const stats = { scanned: 0, created: 0, updated: 0, skipped_opted_out: 0, failed: 0 };
    const user = makeUser({ id: 100, firstName: 'YANGI' });
    await upsertDialogContact(user, { lastMessageAt: new Date() }, stats);

    expect(DialogContact.__store.get('100').first_name).toBe('YANGI');
    expect(stats.updated).toBe(1);
  });
});

describe('upsertDialogContact — telefon manbasi', () => {
  it("Telegram'dan phone kelsa phone_source='telegram' bilan yoziladi", async () => {
    const stats = { scanned: 0, created: 0, updated: 0, skipped_opted_out: 0, failed: 0 };
    const user = makeUser({ id: 5, phone: '998901234567' });
    await upsertDialogContact(user, {}, stats);
    const row = DialogContact.__store.get('5');
    expect(row.phone).toBe('+998901234567');
    expect(row.phone_source).toBe('telegram');
  });

  it("phone bo'lmasa mavjud qiymatga tegilmaydi (yangilashda maydon umuman yuborilmaydi)", async () => {
    DialogContact.__store.set('6', { id: 3, tg_user_id: '6', phone: '+998900000000', phone_source: 'lookup', opted_out: false });
    const stats = { scanned: 0, created: 0, updated: 0, skipped_opted_out: 0, failed: 0 };
    const user = makeUser({ id: 6, phone: null });
    await upsertDialogContact(user, {}, stats);
    const row = DialogContact.__store.get('6');
    expect(row.phone).toBe('+998900000000');
    expect(row.phone_source).toBe('lookup');
  });
});
