import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/models.js', () => ({
  PhoneLookup: {
    findOne: vi.fn(),
    create: vi.fn(),
    destroy: vi.fn(),
    update: vi.fn(async () => [0]),
  },
}));

const { PhoneLookup } = await import('../src/db/models.js');
const { purgeExpired, get, put } = await import('../src/lookup/cache.js');

beforeEach(() => {
  vi.clearAllMocks();
  PhoneLookup.update.mockResolvedValue([0]);
});

describe('purgeExpired', () => {
  it("muddati o'tgan qatorlarni destroy() qilmaydi — faqat nozik maydonlarni tozalab, qatorni saqlaydi", async () => {
    await purgeExpired();
    expect(PhoneLookup.destroy).not.toHaveBeenCalled();
  });

  it("expires_at o'tgan, hali tozalanmagan (purged_at: null) qatorlarni phone/raw_response=null va purged_at bilan yangilaydi", async () => {
    await purgeExpired();

    const expireCall = PhoneLookup.update.mock.calls.find(
      ([fields]) => 'purged_at' in fields
    );
    expect(expireCall).toBeTruthy();
    const [fields, options] = expireCall;

    expect(fields.phone).toBeNull();
    expect(fields.raw_response).toBeNull();
    expect(fields.purged_at).toBeInstanceOf(Date);

    expect(options.where.purged_at).toBeNull();
    expect(options.where.expires_at).toBeDefined();
  });

  it("allaqachon tozalangan (purged_at not null) qatorlarga tegilmaydi — where sharti shuni ta'minlaydi", async () => {
    await purgeExpired();
    const expireCall = PhoneLookup.update.mock.calls.find(([fields]) => 'purged_at' in fields);
    // where.purged_at: null — faqat hali tozalanmagan qatorlar mos keladi,
    // shuning uchun bu funksiya bir xil qatorni kuniga qayta "yangilamaydi".
    expect(expireCall[1].where.purged_at).toBeNull();
  });

  it("raw_response'ni saqlash muddati (LOOKUP_RAW_RETENTION_DAYS) tugagan, hali muddati o'tmagan qatorlar uchun ham alohida ishlaydi", async () => {
    await purgeExpired();
    // Ikkinchi update() chaqiruvi — faqat raw_response'ni tozalaydigan,
    // purged_at'ga tegmaydigan alohida yo'l.
    const rawCall = PhoneLookup.update.mock.calls.find(
      ([fields]) => !('purged_at' in fields) && 'raw_response' in fields
    );
    expect(rawCall).toBeTruthy();
    expect(rawCall[0].raw_response).toBeNull();
  });

  it('natijada expiredCount/rawCleared sonlarini qaytaradi', async () => {
    PhoneLookup.update.mockResolvedValueOnce([5]).mockResolvedValueOnce([2]);
    const result = await purgeExpired();
    expect(result).toEqual({ expiredCount: 5, rawCleared: 2 });
  });
});

describe('cache get/put (regressiyaga qarshi — mavjud xulq saqlanadi)', () => {
  it('get() faqat expires_at > now bo\'lgan qatorni qaytaradi', async () => {
    PhoneLookup.findOne.mockResolvedValue({ id: 1, found: true });
    const row = await get('someuser');
    expect(row).toEqual({ id: 1, found: true });
    const [options] = PhoneLookup.findOne.mock.calls[0];
    expect(options.where.contact_value).toBe('someuser');
  });

  it("put() expires_at'ni kelajakka o'rnatib yangi qator yaratadi", async () => {
    PhoneLookup.create.mockResolvedValue({ id: 1 });
    await put('someuser', { found: true, phone: '+998901234567', provider: 'gramjs' });
    const [fields] = PhoneLookup.create.mock.calls[0];
    expect(fields.expires_at.getTime()).toBeGreaterThan(Date.now());
  });
});
