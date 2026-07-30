import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

vi.mock('../src/db/models.js', () => ({
  TelegramAccount: { findOne: vi.fn() },
}));

vi.mock('../src/telegram/client.js', () => ({
  getPool: vi.fn(),
  RateLimitedSession: class FakeRateLimitedSession {},
}));

const { TelegramAccount } = await import('../src/db/models.js');
const { getPool } = await import('../src/telegram/client.js');
const { findLookupAccount, lookupViaTgBot, resetBotState } = await import('../src/lookup/providers/tgbot.js');
const config = (await import('../src/config/index.js')).default;

beforeEach(() => {
  vi.clearAllMocks();
  resetBotState();
});

describe('findLookupAccount', () => {
  it("label (config.lookup.botAccountLabel) va status='active' bo'yicha akkaunt qidiradi", async () => {
    const fakeAccount = { id: 1, label: 'lookup', status: 'active', session_string: 'xxx' };
    TelegramAccount.findOne.mockResolvedValue(fakeAccount);

    const account = await findLookupAccount();

    expect(TelegramAccount.findOne).toHaveBeenCalledWith({
      where: { label: config.lookup.botAccountLabel, status: 'active' },
    });
    expect(account).toBe(fakeAccount);
  });

  it("mos akkaunt topilmasa aniq xato tashlaydi (label nomi bilan)", async () => {
    TelegramAccount.findOne.mockResolvedValue(null);
    await expect(findLookupAccount()).rejects.toThrow(
      `Lookup uchun alohida akkaunt topilmadi (label: ${config.lookup.botAccountLabel}) — qo'shing`
    );
  });
});

describe("lookupViaTgBot — umumiy getPool()ga fallback qilmaydi", () => {
  it("mos akkaunt topilmasa ham getPool() HECH QACHON chaqirilmaydi", async () => {
    TelegramAccount.findOne.mockResolvedValue(null);

    await expect(lookupViaTgBot('someuser')).rejects.toThrow(/Lookup uchun alohida akkaunt topilmadi/);
    expect(getPool).not.toHaveBeenCalled();
  });
});

describe('src/lookup/providers/tgbot.js manbasi', () => {
  it("getPool()ni import QILMAYDI va chaqirmaydi (izohlarda tilga olinishi mumkin, lekin real kodda emas — statik tekshiruv)", () => {
    const path = fileURLToPath(new URL('../src/lookup/providers/tgbot.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    // Izoh qatorlarini (`//...`) olib tashlab, faqat HAQIQIY koddagi
    // ishlatilishini tekshiramiz — izohlarda "getPool()" so'zi (nima
    // uchun ishlatilmasligini tushuntirish uchun) bemalol uchrashi mumkin.
    const codeOnly = source
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(codeOnly).not.toMatch(/import\s*{[^}]*\bgetPool\b[^}]*}\s*from/);
    expect(codeOnly).not.toMatch(/\bgetPool\s*\(/);
  });
});
