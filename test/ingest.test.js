import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertGroupLead = vi.fn();
vi.mock('../src/db/groupLeads.js', () => ({
  upsertGroupLead: (...args) => upsertGroupLead(...args),
  updateSourceCursor: vi.fn(),
}));

const { ingestMessages } = await import('../src/lib/ingest.js');

beforeEach(() => {
  upsertGroupLead.mockReset();
  upsertGroupLead.mockResolvedValue({ inserted: true, optedOut: false });
});

function msg(overrides = {}) {
  return {
    sourceId: 1,
    messageId: 100,
    messageUrl: 'https://t.me/chan/100',
    text: '',
    postedAt: new Date('2026-02-14T00:00:00Z'),
    username: 'someone',
    displayName: 'Someone',
    ...overrides,
  };
}

describe('ingestMessages', () => {
  it('inserts a phone found in a message with no keyword filter', async () => {
    const stats = await ingestMessages(1, [msg({ text: 'sotiladi, +998901234567' })], {});
    expect(stats).toMatchObject({ scanned: 1, matched: 1, phonesFound: 1, inserted: 1, duplicate: 0, suppressed: 0 });
    expect(upsertGroupLead).toHaveBeenCalledTimes(1);
    expect(upsertGroupLead).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 1, phoneE164: '+998901234567', matchedKw: null })
    );
  });

  it('counts a message with no phone as matched but not phonesFound/inserted', async () => {
    const stats = await ingestMessages(1, [msg({ text: 'hech qanday raqam yoq' })], {});
    expect(stats).toMatchObject({ scanned: 1, matched: 1, phonesFound: 0, inserted: 0, duplicate: 0 });
    expect(upsertGroupLead).not.toHaveBeenCalled();
  });

  it('skips messages that do not match the keyword filter (no phone extraction attempted)', async () => {
    const stats = await ingestMessages(1, [msg({ text: '+998901234567 lekin kalit soz yoq' })], {
      keywords: ['sotiladi'],
    });
    expect(stats).toMatchObject({ scanned: 1, matched: 0, phonesFound: 0, inserted: 0 });
    expect(upsertGroupLead).not.toHaveBeenCalled();
  });

  it('applies a case-insensitive keyword filter and records matched_kw', async () => {
    const stats = await ingestMessages(1, [msg({ text: 'SOTILADI: +998901234567' })], { keywords: ['sotiladi'] });
    expect(stats.matched).toBe(1);
    expect(upsertGroupLead).toHaveBeenCalledWith(expect.objectContaining({ matchedKw: 'sotiladi' }));
  });

  it('upserts every distinct phone found in one message', async () => {
    const stats = await ingestMessages(1, [msg({ text: '+998901234567 yoki +998911234567' })], {});
    expect(stats.phonesFound).toBe(2);
    expect(upsertGroupLead).toHaveBeenCalledTimes(2);
  });

  it('counts a conflict (already collected) as a duplicate, not inserted', async () => {
    upsertGroupLead.mockResolvedValue({ inserted: false, optedOut: null });
    const stats = await ingestMessages(1, [msg({ text: '+998901234567' })], {});
    expect(stats).toMatchObject({ inserted: 0, duplicate: 1 });
  });

  it('still counts an opted-out phone as inserted, but flags it as suppressed', async () => {
    upsertGroupLead.mockResolvedValue({ inserted: true, optedOut: true });
    const stats = await ingestMessages(1, [msg({ text: '+998901234567' })], {});
    expect(stats).toMatchObject({ inserted: 1, suppressed: 1, duplicate: 0 });
  });

  it('tracks the newest message id seen across all messages', async () => {
    const stats = await ingestMessages(
      1,
      [msg({ messageId: 100, text: '+998901234567' }), msg({ messageId: 250, text: 'no phone here' })],
      {}
    );
    expect(stats.newestMsgId).toBe(250);
  });

  it('returns zeroed stats for an empty message list', async () => {
    const stats = await ingestMessages(1, [], {});
    expect(stats).toMatchObject({ scanned: 0, matched: 0, phonesFound: 0, inserted: 0, duplicate: 0, suppressed: 0 });
  });
});
