import { describe, it, expect } from 'vitest';
import { Op } from 'sequelize';
import { buildWhere, buildOrder, pickOptedOutUpdate } from '../src/api/dialogRoutes.js';

describe('buildWhere', () => {
  it('returns an empty object when no filters are given', () => {
    expect(buildWhere({})).toEqual({});
  });

  it('has_phone=true -> phone Op.ne null', () => {
    expect(buildWhere({ has_phone: 'true' }).phone).toEqual({ [Op.ne]: null });
  });

  it('has_phone=false -> phone null', () => {
    expect(buildWhere({ has_phone: 'false' }).phone).toBeNull();
  });

  it('is_premium true/false -> aniq boolean filtri', () => {
    expect(buildWhere({ is_premium: 'true' }).is_premium).toBe(true);
    expect(buildWhere({ is_premium: 'false' }).is_premium).toBe(false);
  });

  it('is_bot true/false -> aniq boolean filtri', () => {
    expect(buildWhere({ is_bot: 'true' }).is_bot).toBe(true);
    expect(buildWhere({ is_bot: 'false' }).is_bot).toBe(false);
  });

  it('opted_out true/false -> aniq boolean filtri', () => {
    expect(buildWhere({ opted_out: 'true' }).opted_out).toBe(true);
    expect(buildWhere({ opted_out: 'false' }).opted_out).toBe(false);
  });

  it('premium_mentions_gte -> Op.gte raqam filtri', () => {
    expect(buildWhere({ premium_mentions_gte: '3' }).premium_mentions).toEqual({ [Op.gte]: 3 });
  });

  it("yaroqsiz premium_mentions_gte ('abc') filtr qo'shmaydi", () => {
    expect(buildWhere({ premium_mentions_gte: 'abc' }).premium_mentions).toBeUndefined();
  });

  it('q -> ism/username bo\'yicha OR qidiruv', () => {
    const where = buildWhere({ q: 'Ali' });
    expect(where[Op.or]).toEqual([
      { first_name: { [Op.iLike]: '%Ali%' } },
      { last_name: { [Op.iLike]: '%Ali%' } },
      { username: { [Op.iLike]: '%Ali%' } },
    ]);
  });

  it('q vergul bilan ajratilgan bir nechta so\'zni OR qiladi', () => {
    const where = buildWhere({ q: 'Ali, Vali' });
    expect(where[Op.or]).toHaveLength(6);
  });

  it("bir nechta filtr birga qo'llanadi", () => {
    const where = buildWhere({ has_phone: 'true', is_premium: 'true', premium_mentions_gte: '2' });
    expect(where).toEqual({
      phone: { [Op.ne]: null },
      is_premium: true,
      premium_mentions: { [Op.gte]: 2 },
    });
  });
});

describe('buildOrder', () => {
  it('defaults to premium_mentions desc', () => {
    expect(buildOrder(undefined)).toEqual([['premium_mentions', 'DESC']]);
  });

  it('accepts a known sortable field and direction', () => {
    expect(buildOrder('last_message_at asc')).toEqual([['last_message_at', 'ASC']]);
  });

  it("falls back to premium_mentions for an unknown field", () => {
    expect(buildOrder('phone asc')).toEqual([['premium_mentions', 'ASC']]);
  });
});

describe('pickOptedOutUpdate', () => {
  it('faqat opted_out maydonini ajratib oladi (boshqalarini e\'tiborsiz qoldiradi)', () => {
    const result = pickOptedOutUpdate({ opted_out: true, first_name: 'hacked', status: 'contacted', premium_mentions: 999 });
    expect(result).toEqual({ opted_out: true });
  });

  it('opted_out=false uchun ham ishlaydi', () => {
    expect(pickOptedOutUpdate({ opted_out: false })).toEqual({ opted_out: false });
  });

  it("opted_out boolean bo'lmasa null qaytaradi", () => {
    expect(pickOptedOutUpdate({ opted_out: 'true' })).toBeNull();
    expect(pickOptedOutUpdate({ opted_out: 1 })).toBeNull();
    expect(pickOptedOutUpdate({ opted_out: null })).toBeNull();
  });

  it('opted_out berilmasa null qaytaradi', () => {
    expect(pickOptedOutUpdate({})).toBeNull();
    expect(pickOptedOutUpdate(undefined)).toBeNull();
    expect(pickOptedOutUpdate({ first_name: 'x' })).toBeNull();
  });
});
