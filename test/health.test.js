import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const mockSequelize = { models: {}, query: (...args) => queryMock(...args) };

vi.mock('../src/db/index.js', () => ({ default: mockSequelize }));

const { checkHealth } = await import('../src/db/health.js');

function fakeModel(tableName) {
  return { getTableName: () => tableName };
}

beforeEach(() => {
  queryMock.mockReset();
  mockSequelize.models = {};
});

describe('checkHealth', () => {
  it('ok:true qaytaradi — barcha kutilgan jadval (sequelize.models) mavjud bo\'lsa', async () => {
    mockSequelize.models = {
      Lead: fakeModel('leads'),
      TelegramAccount: fakeModel('telegram_accounts'),
    };
    queryMock.mockResolvedValue([{ tablename: 'leads' }, { tablename: 'telegram_accounts' }]);

    const result = await checkHealth();

    expect(result).toEqual({
      ok: true,
      db: true,
      tables: { expected: ['leads', 'telegram_accounts'], missing: [] },
      migrationsNeeded: false,
    });
  });

  it('yetishmayotgan jadvalni nomi bilan aniqlaydi va migrationsNeeded:true qaytaradi', async () => {
    mockSequelize.models = {
      Lead: fakeModel('leads'),
      TelegramAccount: fakeModel('telegram_accounts'),
      Campaign: fakeModel('campaigns'),
    };
    // Faqat 'leads' mavjud — 'telegram_accounts' va 'campaigns' yetishmaydi
    queryMock.mockResolvedValue([{ tablename: 'leads' }]);

    const result = await checkHealth();

    expect(result.ok).toBe(false);
    expect(result.db).toBe(true);
    expect(result.migrationsNeeded).toBe(true);
    expect(result.tables.missing.sort()).toEqual(['campaigns', 'telegram_accounts'].sort());
  });

  it('kutilgan ro\'yxatni sequelize.models\'dan DINAMIK oladi — qo\'lda yozilgan ro\'yxat yo\'q', async () => {
    // Modellar ro'yxatini o'zgartirsak, expected ro'yxat ham avtomatik moslashishi kerak
    mockSequelize.models = {
      Lead: fakeModel('leads'),
      NewFeatureModel: fakeModel('brand_new_table'),
    };
    queryMock.mockResolvedValue([{ tablename: 'leads' }]);

    const result = await checkHealth();

    expect(result.tables.expected.sort()).toEqual(['brand_new_table', 'leads'].sort());
    expect(result.tables.missing).toEqual(['brand_new_table']);
  });

  it('bir xil jadval nomini takrorlamaydi (bir nechta model bitta jadvalga tegishli bo\'lsa)', async () => {
    mockSequelize.models = {
      A: fakeModel('leads'),
      B: fakeModel('leads'),
    };
    queryMock.mockResolvedValue([{ tablename: 'leads' }]);

    const result = await checkHealth();

    expect(result.tables.expected).toEqual(['leads']);
  });

  it('DB ulanishi yiqilsa ok:false, db:false qaytaradi — sxema haqida "topilmadi" demaydi', async () => {
    mockSequelize.models = { Lead: fakeModel('leads') };
    queryMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await checkHealth();

    expect(result.ok).toBe(false);
    expect(result.db).toBe(false);
    expect(result.migrationsNeeded).toBe(false);
    expect(result.tables.missing).toEqual([]);
  });

  it('hech qanday model ro\'yxatdan o\'tmagan bo\'lsa ham xato tashlamaydi', async () => {
    mockSequelize.models = {};
    queryMock.mockResolvedValue([]);

    const result = await checkHealth();

    expect(result).toEqual({
      ok: true,
      db: true,
      tables: { expected: [], missing: [] },
      migrationsNeeded: false,
    });
  });
});
