import { describe, it, expect } from 'vitest';
import { rulesEqual } from '../src/api/folderRoutes.js';

describe('rulesEqual', () => {
  it('bir xil obyektlarni teng deb topadi', () => {
    expect(rulesEqual({ premium_mentions_gte: 3 }, { premium_mentions_gte: 3 })).toBe(true);
  });

  it("kalit tartibi farq qilsa ham teng deb topadi (JSON.stringify to'g'ridan-to'g'ri solishtirish yetarli emas)", () => {
    const a = { premium_mentions_gte: 3, is_premium: true };
    const b = { is_premium: true, premium_mentions_gte: 3 };
    expect(rulesEqual(a, b)).toBe(true);
  });

  it("qiymat farq qilsa yolg'on qaytaradi", () => {
    expect(rulesEqual({ premium_mentions_gte: 3 }, { premium_mentions_gte: 5 })).toBe(false);
  });

  it("qo'shimcha kalit bo'lsa yolg'on qaytaradi", () => {
    expect(rulesEqual({ premium_mentions_gte: 3 }, { premium_mentions_gte: 3, is_premium: true })).toBe(false);
  });

  it('bir xil referensga teng deb topadi (qisqa yo\'l)', () => {
    const rule = { premium_mentions_gte: 3 };
    expect(rulesEqual(rule, rule)).toBe(true);
  });

  it('null/undefined bilan solishtirilsa yolg\'on qaytaradi (ikkalasi ham null bo\'lmasa)', () => {
    expect(rulesEqual(null, { premium_mentions_gte: 3 })).toBe(false);
    expect(rulesEqual({ premium_mentions_gte: 3 }, null)).toBe(false);
    expect(rulesEqual(null, undefined)).toBe(false);
  });

  it("ichma-ich (nested) qiymatlarni ham to'g'ri solishtiradi", () => {
    expect(rulesEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(true);
    expect(rulesEqual({ a: { x: 1 } }, { a: { x: 2 } })).toBe(false);
  });
});
