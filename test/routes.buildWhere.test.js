import { describe, it, expect } from 'vitest';
import { Op } from 'sequelize';
import { buildWhere, buildOrder } from '../src/api/routes.js';

describe('buildWhere', () => {
  it('matches contact_type=phone against both "phone" and "both" rows', () => {
    const where = buildWhere({ contact_type: 'phone' });
    expect(where.contact_type).toEqual({ [Op.in]: ['phone', 'both'] });
  });

  it('matches contact_type=username against both "username" and "both" rows', () => {
    const where = buildWhere({ contact_type: 'username' });
    expect(where.contact_type).toEqual({ [Op.in]: ['username', 'both'] });
  });

  it('keeps an exact match for contact_type=both or none', () => {
    expect(buildWhere({ contact_type: 'both' }).contact_type).toBe('both');
    expect(buildWhere({ contact_type: 'none' }).contact_type).toBe('none');
  });

  it('filters has_phone true/false', () => {
    expect(buildWhere({ has_phone: 'true' }).phone).toEqual({ [Op.ne]: null });
    expect(buildWhere({ has_phone: 'false' }).phone).toBeNull();
  });

  it('hides bot contacts when hide_bots=true', () => {
    expect(buildWhere({ hide_bots: 'true' }).contact_is_bot).toBe(false);
    expect(buildWhere({}).contact_is_bot).toBeUndefined();
  });

  it('splits matched_keyword into an Op.in list', () => {
    const where = buildWhere({ matched_keyword: 'Toshkent, biznes ,SMM' });
    expect(where.matched_keyword).toEqual({ [Op.in]: ['Toshkent', 'biznes', 'SMM'] });
  });

  it('builds a createdAt range from date_from/date_to', () => {
    const where = buildWhere({ date_from: '2026-01-01T00:00', date_to: '2026-02-01T00:00' });
    expect(where.createdAt[Op.gte]).toEqual(new Date('2026-01-01T00:00'));
    expect(where.createdAt[Op.lte]).toEqual(new Date('2026-02-01T00:00'));
  });

  it('splits q into comma-separated OR terms across fields', () => {
    const where = buildWhere({ q: 'toshkent, biznes' });
    expect(where[Op.or]).toHaveLength(8);
  });

  it('returns an empty object when no filters are given', () => {
    expect(buildWhere({})).toEqual({});
  });
});

describe('buildOrder', () => {
  it('defaults to gemini_score desc', () => {
    expect(buildOrder(undefined)).toEqual([['gemini_score', 'DESC']]);
  });

  it('accepts a known sortable field and direction', () => {
    expect(buildOrder('createdAt asc')).toEqual([['createdAt', 'ASC']]);
  });

  it('falls back to gemini_score for an unknown field', () => {
    expect(buildOrder('phone asc')).toEqual([['gemini_score', 'ASC']]);
  });
});
