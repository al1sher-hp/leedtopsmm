import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/models.js', () => ({
  LookupAudit: { create: vi.fn(async (fields) => ({ id: 1, ...fields })) },
}));

const { LookupAudit } = await import('../src/db/models.js');
const { maskPhone, record } = await import('../src/lookup/audit.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('maskPhone', () => {
  it('+998901234567 -> +9989****4567', () => {
    expect(maskPhone('+998901234567')).toBe('+9989****4567');
  });

  it('null/undefined uchun null qaytaradi', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
  });

  it("juda qisqa/notanish formatlar butunlay yashiriladi", () => {
    expect(maskPhone('12345')).toBe('****');
  });

  it("niqoblangan qiymatda to'liq raqamning o'rtasi ASLO ko'rinmaydi", () => {
    const masked = maskPhone('+998901234567');
    expect(masked).not.toContain('90123');
    expect(masked).not.toBe('+998901234567');
  });
});

describe('record', () => {
  it("to'liq raqam AUDIT yozuviga umuman yozilmaydi — faqat niqoblangan varianti", async () => {
    await record({
      query: 'someuser',
      provider: 'gramjs',
      found: true,
      actor: 'api',
      purpose: 'test',
      phone: '+998901234567',
    });

    expect(LookupAudit.create).toHaveBeenCalledTimes(1);
    const written = LookupAudit.create.mock.calls[0][0];

    expect(written.result_phone_masked).toBe('+9989****4567');
    expect(JSON.stringify(written)).not.toContain('+998901234567');
    expect(written.query_value).toBe('someuser');
    expect(written.provider).toBe('gramjs');
    expect(written.found).toBe(true);
    expect(written.actor).toBe('api');
    expect(written.purpose).toBe('test');
  });

  it('phone berilmasa result_phone_masked null bo\'ladi', async () => {
    await record({ query: 'someuser', provider: 'gramjs', found: false, actor: 'api' });
    const written = LookupAudit.create.mock.calls[0][0];
    expect(written.result_phone_masked).toBeNull();
  });

  it('standart query_type "username"', async () => {
    await record({ query: 'someuser', provider: 'gramjs', found: false, actor: 'api' });
    const written = LookupAudit.create.mock.calls[0][0];
    expect(written.query_type).toBe('username');
  });
});
