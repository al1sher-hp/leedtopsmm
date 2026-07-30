import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/blacklist/blacklist.js', () => ({
  isBlacklisted: vi.fn(async () => false),
}));

vi.mock('../src/db/models.js', () => ({
  DialogContact: { findOne: vi.fn(async () => null) },
  LookupAudit: { count: vi.fn(async () => 0) },
}));

const { isBlacklisted } = await import('../src/blacklist/blacklist.js');
const { DialogContact, LookupAudit } = await import('../src/db/models.js');
const { assertAllowed } = await import('../src/lookup/guard.js');

beforeEach(() => {
  vi.clearAllMocks();
  isBlacklisted.mockResolvedValue(false);
  DialogContact.findOne.mockResolvedValue(null);
  LookupAudit.count.mockResolvedValue(0);
});

describe('assertAllowed', () => {
  it("hech qanday cheklov bo'lmasa ruxsat beradi (xato tashlamaydi)", async () => {
    await expect(assertAllowed('someuser')).resolves.toBeUndefined();
  });

  it("qora ro'yxatda bo'lsa LOOKUP_BLACKLISTED tashlaydi (blacklist gate)", async () => {
    isBlacklisted.mockResolvedValue(true);
    await expect(assertAllowed('someuser')).rejects.toMatchObject({ code: 'LOOKUP_BLACKLISTED' });
  });

  it('opted_out=true bo\'lgan kontakt uchun LOOKUP_OPTED_OUT tashlaydi', async () => {
    DialogContact.findOne.mockResolvedValue({ opted_out: true });
    await expect(assertAllowed('someuser')).rejects.toMatchObject({ code: 'LOOKUP_OPTED_OUT' });
  });

  it('opted_out=false bo\'lgan kontakt uchun ruxsat beradi', async () => {
    DialogContact.findOne.mockResolvedValue({ opted_out: false });
    await expect(assertAllowed('someuser')).resolves.toBeUndefined();
  });

  it("kunlik cap (standart 300) tugagan bo'lsa LOOKUP_DAILY_CAP tashlaydi", async () => {
    LookupAudit.count.mockResolvedValue(300);
    await expect(assertAllowed('someuser')).rejects.toMatchObject({ code: 'LOOKUP_DAILY_CAP' });
  });

  it("cap'dan bitta pastda bo'lsa ruxsat beradi (chegara aniq)", async () => {
    LookupAudit.count.mockResolvedValue(299);
    await expect(assertAllowed('someuser')).resolves.toBeUndefined();
  });

  it("kunlik cap FAQAT provider:'tgbot' urinishlarini sanaydi — 'cache'/'gramjs' xavfsiz so'rovlar cap'ni to'ldirmaydi", async () => {
    await assertAllowed('someuser');
    expect(LookupAudit.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ provider: 'tgbot' }) })
    );
  });

  it("blacklist tekshiruvi BOSHQA tekshiruvlardan OLDIN ishlaydi (qisqa tutashuv)", async () => {
    isBlacklisted.mockResolvedValue(true);
    DialogContact.findOne.mockResolvedValue({ opted_out: true });
    LookupAudit.count.mockResolvedValue(300);

    await expect(assertAllowed('someuser')).rejects.toMatchObject({ code: 'LOOKUP_BLACKLISTED' });
    expect(DialogContact.findOne).not.toHaveBeenCalled();
    expect(LookupAudit.count).not.toHaveBeenCalled();
  });

  it('@ prefiksini olib tashlab tekshiradi', async () => {
    await assertAllowed('@someuser');
    expect(isBlacklisted).toHaveBeenCalledWith('someuser');
  });
});
