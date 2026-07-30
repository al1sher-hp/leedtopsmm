import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lookup/guard.js', () => ({
  assertAllowed: vi.fn(async () => {}),
}));

vi.mock('../src/lookup/cache.js', () => ({
  get: vi.fn(async () => null),
  put: vi.fn(async () => {}),
}));

vi.mock('../src/lookup/audit.js', () => ({
  record: vi.fn(async () => {}),
}));

vi.mock('../src/lookup/providers/gramjs.js', () => ({
  lookupViaGramjs: vi.fn(),
  PROVIDER_NAME: 'gramjs',
}));

vi.mock('../src/lookup/providers/tgbot.js', () => ({
  lookupViaTgBot: vi.fn(),
  PROVIDER_NAME: 'tgbot',
  botState: {},
}));

vi.mock('../src/db/models.js', () => ({
  JobRun: {
    create: vi.fn(async (fields) => {
      const job = { id: 1, ...fields };
      job.update = vi.fn(async (f) => Object.assign(job, f));
      return job;
    }),
  },
  LookupJobResult: {
    create: vi.fn(async (fields) => ({ id: 1, ...fields })),
  },
}));

const { assertAllowed } = await import('../src/lookup/guard.js');
const cache = await import('../src/lookup/cache.js');
const { record } = await import('../src/lookup/audit.js');
const { lookupViaGramjs } = await import('../src/lookup/providers/gramjs.js');
const { lookupViaTgBot } = await import('../src/lookup/providers/tgbot.js');
const { JobRun, LookupJobResult } = await import('../src/db/models.js');
const { resolve, resolveBulk } = await import('../src/lookup/index.js');

beforeEach(() => {
  vi.clearAllMocks();
  assertAllowed.mockResolvedValue(undefined);
  cache.get.mockResolvedValue(null);
  cache.put.mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
});

describe('resolve — provider zanjiri tartibi', () => {
  it('gramjs topsa (found:true), tgbot chaqirilmaydi', async () => {
    lookupViaGramjs.mockResolvedValue({
      found: true, phone: '+998901234567', provider: 'gramjs', confidence: 'verified',
    });

    const result = await resolve('someuser');

    expect(result.found).toBe(true);
    expect(result.provider).toBe('gramjs');
    expect(lookupViaTgBot).not.toHaveBeenCalled();
  });

  it("gramjs topmasa (found:false), zanjir tgbot'ga o'tadi", async () => {
    lookupViaGramjs.mockResolvedValue({ found: false, provider: 'gramjs', confidence: 'verified' });
    lookupViaTgBot.mockResolvedValue({
      found: true, phone: '+998901112233', provider: 'tgbot', confidence: 'unverified',
    });

    const result = await resolve('someuser');

    expect(lookupViaGramjs).toHaveBeenCalledTimes(1);
    expect(lookupViaTgBot).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('tgbot');
    expect(result.confidence).toBe('unverified');
  });

  it("cache hit'da hech qaysi provider chaqirilmaydi", async () => {
    cache.get.mockResolvedValue({
      found: true, phone: '+998900000000', provider: 'gramjs', confidence: 'verified',
      tg_user_id: '1', first_name: 'X', last_name: null, is_bot: false, source_note: null,
    });

    const result = await resolve('someuser');

    expect(lookupViaGramjs).not.toHaveBeenCalled();
    expect(lookupViaTgBot).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.found).toBe(true);
  });

  it("cache hit ham audit qilinadi (provider:'cache'), lekin kunlik cap'ni to'ldirmaydi", async () => {
    cache.get.mockResolvedValue({
      found: true, phone: '+998900000000', provider: 'gramjs', confidence: 'verified',
      tg_user_id: '1', first_name: 'X', last_name: null, is_bot: false, source_note: null,
    });

    await resolve('someuser');

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ provider: 'cache', found: true, phone: '+998900000000' });
  });

  it('guard bloklasa hech qaysi provider chaqirilmaydi', async () => {
    assertAllowed.mockRejectedValueOnce(Object.assign(new Error('bloklangan'), { code: 'LOOKUP_BLACKLISTED' }));

    await expect(resolve('someuser')).rejects.toThrow('bloklangan');
    expect(lookupViaGramjs).not.toHaveBeenCalled();
    expect(lookupViaTgBot).not.toHaveBeenCalled();
  });

  it("provider='tgbot' berilsa faqat shu chaqiriladi (gramjs o'tkazib yuboriladi)", async () => {
    lookupViaTgBot.mockResolvedValue({ found: true, phone: '+998901112233', provider: 'tgbot' });

    const result = await resolve('someuser', { provider: 'tgbot' });

    expect(lookupViaGramjs).not.toHaveBeenCalled();
    expect(lookupViaTgBot).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('tgbot');
  });

  it("provider='auto' standart to'liq zanjirni ishlatadi", async () => {
    lookupViaGramjs.mockResolvedValue({ found: true, phone: '+998901234567', provider: 'gramjs' });

    const result = await resolve('someuser', { provider: 'auto' });

    expect(result.provider).toBe('gramjs');
    expect(lookupViaTgBot).not.toHaveBeenCalled();
  });

  it('hech kim topmasa found:false qaytaradi, lekin yakuniy natija keshga yoziladi', async () => {
    lookupViaGramjs.mockResolvedValue({ found: false, provider: 'gramjs' });
    lookupViaTgBot.mockResolvedValue({ found: false, provider: 'tgbot' });

    const result = await resolve('someuser');

    expect(result.found).toBe(false);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it('har haqiqatan chaqirilgan provider urinishi audit qilinadi', async () => {
    lookupViaGramjs.mockResolvedValue({ found: false, provider: 'gramjs' });
    lookupViaTgBot.mockResolvedValue({ found: true, phone: '+998901112233', provider: 'tgbot' });

    await resolve('someuser');

    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0][0]).toMatchObject({ provider: 'gramjs', found: false });
    expect(record.mock.calls[1][0]).toMatchObject({ provider: 'tgbot', found: true });
  });

  it('provider xato tashlasa, zanjir keyingisiga o\'tadi (butun so\'rov yiqilmaydi)', async () => {
    lookupViaGramjs.mockRejectedValue(new Error('gramjs xatosi'));
    lookupViaTgBot.mockResolvedValue({ found: true, phone: '+998901112233', provider: 'tgbot' });

    const result = await resolve('someuser');
    expect(result.found).toBe(true);
    expect(result.provider).toBe('tgbot');
  });
});

describe('resolveBulk', () => {
  it("job_id darhol qaytadi (fon rejimida)", async () => {
    lookupViaGramjs.mockResolvedValue({ found: true, phone: '+998901234567', provider: 'gramjs' });
    const { jobId, donePromise } = await resolveBulk(['user1', 'user2']);
    expect(jobId).toBe(1);
    await donePromise;
  });

  it("har natija LookupJobResult'ga bitta INSERT bilan (append) qo'shiladi", async () => {
    lookupViaGramjs.mockResolvedValue({ found: true, phone: '+998901234567', provider: 'gramjs' });
    const queries = ['user1', 'user2', 'user3'];
    const { donePromise } = await resolveBulk(queries);
    await donePromise;

    expect(LookupJobResult.create).toHaveBeenCalledTimes(queries.length);
    expect(LookupJobResult.create.mock.calls[0][0]).toMatchObject({ job_id: 1, query: 'user1', found: true });
  });

  it("job.update() chaqiruvlari soni SO'ROVLAR soniga chiziqli (O(n)) — har birida params_json'ga to'liq " +
    "'results' massivi qayta yozilmaydi", async () => {
    lookupViaGramjs.mockResolvedValue({ found: true, phone: '+998901234567', provider: 'gramjs' });
    const queries = Array.from({ length: 100 }, (_, i) => `user${i}`);
    const { donePromise } = await resolveBulk(queries);
    await donePromise;

    const job = await JobRun.create.mock.results[0].value;
    // 100 ta so'rov uchun 100 ta progress-yangilash + 1 ta "completed" = 101
    expect(job.update).toHaveBeenCalledTimes(queries.length + 1);

    // Progress yangilashlarning HECH BIRIDA katta (o'sib boruvchi) 'results'
    // massivi yo'q — faqat oxirgi (yakuniy) chaqiruvda kichik provider_counts bor.
    const progressCalls = job.update.mock.calls.slice(0, -1);
    for (const [payload] of progressCalls) {
      expect(payload.params_json).toBeUndefined();
      expect(Object.keys(payload).sort()).toEqual(['done', 'failed_count', 'ok_count'].sort());
    }

    const finalCall = job.update.mock.calls[job.update.mock.calls.length - 1][0];
    expect(finalCall.status).toBe('completed');
    expect(finalCall.params_json.provider_counts).toEqual({ gramjs: queries.length });
  });
});
