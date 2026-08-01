import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const mockSequelize = { models: {}, query: (...args) => queryMock(...args) };

vi.mock('../src/db/index.js', () => ({ default: mockSequelize }));

const { checkHealth } = await import('../src/db/health.js');

// health.js'dagi RAW_SQL_TABLES bilan bir xil — group_leads moduli xom SQL
// migratsiya orqali yaratiladi, sequelize.models'da ko'rinmaydi.
const RAW_SQL_TABLES = ['lead_sources', 'group_leads', 'suppression_list', 'export_batches', 'pipeline_keywords'];

function fakeModel(tableName) {
  return { getTableName: () => tableName };
}

function rows(...names) {
  return names.map((tablename) => ({ tablename }));
}

beforeEach(() => {
  queryMock.mockReset();
  mockSequelize.models = {};
});

describe('checkHealth', () => {
  it('ok:true qaytaradi — barcha kutilgan jadval (model + xom SQL) mavjud bo\'lsa', async () => {
    mockSequelize.models = {
      Lead: fakeModel('leads'),
      TelegramAccount: fakeModel('telegram_accounts'),
    };
    queryMock.mockResolvedValue(rows('leads', 'telegram_accounts', ...RAW_SQL_TABLES));

    const result = await checkHealth();

    expect(result.ok).toBe(true);
    expect(result.db).toBe(true);
    expect(result.migrationsNeeded).toBe(false);
    expect(result.tables.missing).toEqual([]);
    expect(result.tables.expected.sort()).toEqual(['leads', 'telegram_accounts', ...RAW_SQL_TABLES].sort());
  });

  it('yetishmayotgan model-jadvalni nomi bilan aniqlaydi va migrationsNeeded:true qaytaradi', async () => {
    mockSequelize.models = {
      Lead: fakeModel('leads'),
      TelegramAccount: fakeModel('telegram_accounts'),
      Campaign: fakeModel('campaigns'),
    };
    // Faqat 'leads' + xom SQL jadvallar mavjud — 'telegram_accounts' va 'campaigns' yetishmaydi
    queryMock.mockResolvedValue(rows('leads', ...RAW_SQL_TABLES));

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
    queryMock.mockResolvedValue(rows('leads', ...RAW_SQL_TABLES));

    const result = await checkHealth();

    expect(result.tables.expected.sort()).toEqual(['brand_new_table', 'leads', ...RAW_SQL_TABLES].sort());
    expect(result.tables.missing).toEqual(['brand_new_table']);
  });

  it('bir xil jadval nomini takrorlamaydi (bir nechta model bitta jadvalga tegishli bo\'lsa)', async () => {
    mockSequelize.models = {
      A: fakeModel('leads'),
      B: fakeModel('leads'),
    };
    queryMock.mockResolvedValue(rows('leads', ...RAW_SQL_TABLES));

    const result = await checkHealth();

    expect(result.tables.expected.filter((t) => t === 'leads')).toHaveLength(1);
  });

  it('model va xom SQL jadval nomi bir xil bo\'lib qolsa ham takrorlanmaydi (dedup)', async () => {
    mockSequelize.models = { GroupLeadLike: fakeModel('group_leads') };
    queryMock.mockResolvedValue(rows('group_leads'));

    const result = await checkHealth();

    expect(result.tables.expected.filter((t) => t === 'group_leads')).toHaveLength(1);
  });

  it('hech qanday model ro\'yxatdan o\'tmagan bo\'lsa ham xom SQL jadvallarni tekshiradi', async () => {
    mockSequelize.models = {};
    queryMock.mockResolvedValue([]);

    const result = await checkHealth();

    expect(result.tables.expected.sort()).toEqual([...RAW_SQL_TABLES].sort());
    expect(result.tables.missing.sort()).toEqual([...RAW_SQL_TABLES].sort());
    expect(result.migrationsNeeded).toBe(true);
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
});
