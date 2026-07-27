import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const mockSequelize = { models: {}, query: (...args) => queryMock(...args) };

vi.mock('../src/db/index.js', () => ({ default: mockSequelize }));

const { checkRequiredTables } = await import('../src/db/health.js');

function fakeModel(tableName) {
  return { getTableName: () => tableName };
}

beforeEach(() => {
  queryMock.mockReset();
  mockSequelize.models = {};
});

describe('checkRequiredTables', () => {
  it('reports ok:true when every expected table (models + raw-SQL) exists', async () => {
    mockSequelize.models = { Lead: fakeModel('leads') };
    queryMock.mockResolvedValue([
      { tablename: 'leads' },
      { tablename: 'lead_sources' },
      { tablename: 'group_leads' },
      { tablename: 'suppression_list' },
      { tablename: 'export_batches' },
      { tablename: 'pipeline_keywords' },
    ]);

    const result = await checkRequiredTables();
    expect(result).toEqual({ ok: true, expectedCount: 6, missing: [] });
  });

  it('surfaces a missing Sequelize-model table by name (the telegram_accounts case)', async () => {
    mockSequelize.models = { TelegramAccount: fakeModel('telegram_accounts'), Lead: fakeModel('leads') };
    queryMock.mockResolvedValue([{ tablename: 'leads' }]);

    const result = await checkRequiredTables();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('telegram_accounts');
  });

  it('also checks the raw-SQL-only group-leads tables even with zero Sequelize models registered', async () => {
    mockSequelize.models = {};
    queryMock.mockResolvedValue([]);

    const result = await checkRequiredTables();
    expect(result.expectedCount).toBe(5);
    expect(result.missing.sort()).toEqual(
      ['export_batches', 'group_leads', 'lead_sources', 'pipeline_keywords', 'suppression_list'].sort()
    );
  });

  it('de-duplicates a table name that appears as both a model table and a raw-SQL table', async () => {
    mockSequelize.models = { GroupLeadLike: fakeModel('group_leads') };
    queryMock.mockResolvedValue([{ tablename: 'group_leads' }]);

    const result = await checkRequiredTables();
    // group_leads yagona marta hisoblanadi, ikki marta emas
    expect(result.expectedCount).toBe(5);
  });
});
