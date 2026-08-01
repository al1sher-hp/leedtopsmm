import { describe, it, expect } from 'vitest';
import { Op } from 'sequelize';
import { buildDialogContactQuery } from '../src/folders/rules.js';

describe('buildDialogContactQuery', () => {
  it('opted_out=true yozuvlarni har doim chetlab o\'tadi (qoida bo\'sh bo\'lsa ham)', () => {
    const { where } = buildDialogContactQuery({});
    expect(where.opted_out).toBe(false);
  });

  it("rule ichida opted_out qiymati berilsa ham e'tiborsiz qoldiriladi", () => {
    const { where } = buildDialogContactQuery({ opted_out: true, premium_mentions_gte: 1 });
    expect(where.opted_out).toBe(false);
  });

  it('premium_mentions_gte -> Op.gte filtri', () => {
    const { where } = buildDialogContactQuery({ premium_mentions_gte: 3 });
    expect(where.premium_mentions).toEqual({ [Op.gte]: 3 });
  });

  it('is_premium -> aniq qiymat filtri', () => {
    expect(buildDialogContactQuery({ is_premium: true }).where.is_premium).toBe(true);
    expect(buildDialogContactQuery({ is_premium: false }).where.is_premium).toBe(false);
  });

  it('has_phone=true -> phone Op.ne null', () => {
    const { where } = buildDialogContactQuery({ has_phone: true });
    expect(where.phone).toEqual({ [Op.ne]: null });
  });

  it('has_phone=false -> phone null', () => {
    const { where } = buildDialogContactQuery({ has_phone: false });
    expect(where.phone).toBeNull();
  });

  it('has_phone berilmasa phone filtri qo\'shilmaydi', () => {
    const { where } = buildDialogContactQuery({});
    expect(where.phone).toBeUndefined();
  });

  it('last_message_after -> Op.gte Date filtri', () => {
    const { where } = buildDialogContactQuery({ last_message_after: '2026-01-01T00:00:00Z' });
    expect(where.last_message_at).toEqual({ [Op.gte]: new Date('2026-01-01T00:00:00Z') });
  });

  it('order_by=last_message_at -> shu maydon bo\'yicha DESC', () => {
    const { order } = buildDialogContactQuery({ order_by: 'last_message_at' });
    expect(order).toEqual([['last_message_at', 'DESC']]);
  });

  it("standart order — premium_mentions DESC (order_by berilmasa yoki noma'lum bo'lsa)", () => {
    expect(buildDialogContactQuery({}).order).toEqual([['premium_mentions', 'DESC']]);
    expect(buildDialogContactQuery({ order_by: 'random_field' }).order).toEqual([['premium_mentions', 'DESC']]);
  });

  it('limit berilsa query.limit ga qo\'shiladi, berilmasa yo\'q', () => {
    expect(buildDialogContactQuery({ limit: 500 }).limit).toBe(500);
    expect(buildDialogContactQuery({}).limit).toBeUndefined();
  });

  it("bir nechta shart birga qo'llanadi", () => {
    const { where, order, limit } = buildDialogContactQuery({
      premium_mentions_gte: 2,
      is_premium: true,
      has_phone: true,
      limit: 500,
      order_by: 'premium_mentions',
    });
    expect(where).toEqual({
      opted_out: false,
      premium_mentions: { [Op.gte]: 2 },
      is_premium: true,
      phone: { [Op.ne]: null },
    });
    expect(order).toEqual([['premium_mentions', 'DESC']]);
    expect(limit).toBe(500);
  });
});
