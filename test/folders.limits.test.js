import { describe, it, expect, vi } from 'vitest';
import {
  getAccountLimits, assertCanAddFolder, splitToLimit, REGULAR_LIMITS, PREMIUM_LIMITS,
} from '../src/folders/limits.js';

describe('splitToLimit', () => {
  it('keeps everything in "fit" when under the limit', () => {
    const peers = [1, 2, 3];
    const { fit, overflow } = splitToLimit(peers, { maxPeersPerFolder: 10 });
    expect(fit).toEqual([1, 2, 3]);
    expect(overflow).toEqual([]);
  });

  it('splits exactly at the boundary (peers.length === limit)', () => {
    const peers = [1, 2, 3];
    const { fit, overflow } = splitToLimit(peers, { maxPeersPerFolder: 3 });
    expect(fit).toEqual([1, 2, 3]);
    expect(overflow).toEqual([]);
  });

  it("500 kishi 200'lik jildga sig'maydi — birinchi 200 fit, qolgan 300 overflow", () => {
    const peers = Array.from({ length: 500 }, (_, i) => i);
    const { fit, overflow } = splitToLimit(peers, PREMIUM_LIMITS);
    expect(fit).toHaveLength(200);
    expect(overflow).toHaveLength(300);
    expect(fit[0]).toBe(0);
    expect(fit[199]).toBe(199);
    expect(overflow[0]).toBe(200);
  });

  it("oddiy akkaunt (100 chat) uchun ham to'g'ri bo'linadi", () => {
    const peers = Array.from({ length: 150 }, (_, i) => i);
    const { fit, overflow } = splitToLimit(peers, REGULAR_LIMITS);
    expect(fit).toHaveLength(100);
    expect(overflow).toHaveLength(50);
  });

  it('handles an empty peer list', () => {
    const { fit, overflow } = splitToLimit([], REGULAR_LIMITS);
    expect(fit).toEqual([]);
    expect(overflow).toEqual([]);
  });
});

describe('assertCanAddFolder', () => {
  it("limitdan pastda bo'lsa xato tashlamaydi", () => {
    expect(() => assertCanAddFolder(9, REGULAR_LIMITS)).not.toThrow();
  });

  it('limitga yetganda xato tashlaydi', () => {
    expect(() => assertCanAddFolder(10, REGULAR_LIMITS)).toThrow(/limiti tugagan/);
  });

  it('limitdan oshganda ham xato tashlaydi', () => {
    expect(() => assertCanAddFolder(11, REGULAR_LIMITS)).toThrow();
  });

  it('premium limitlar bilan chegara 20', () => {
    expect(() => assertCanAddFolder(19, PREMIUM_LIMITS)).not.toThrow();
    expect(() => assertCanAddFolder(20, PREMIUM_LIMITS)).toThrow();
  });
});

describe('getAccountLimits', () => {
  it('premium bo\'lsa PREMIUM_LIMITS qaytaradi', async () => {
    const client = { invoke: vi.fn().mockResolvedValue({ fullUser: { premium: true } }) };
    const limits = await getAccountLimits(client);
    expect(limits).toEqual(PREMIUM_LIMITS);
  });

  it("premium bo'lmasa REGULAR_LIMITS qaytaradi", async () => {
    const client = { invoke: vi.fn().mockResolvedValue({ fullUser: { premium: false } }) };
    const limits = await getAccountLimits(client);
    expect(limits).toEqual(REGULAR_LIMITS);
  });

  it("aniqlab bo'lmasa (xato) xavfsiz tomonga — REGULAR_LIMITS", async () => {
    const client = { invoke: vi.fn().mockRejectedValue(new Error('tarmoq xatosi')) };
    const limits = await getAccountLimits(client);
    expect(limits).toEqual(REGULAR_LIMITS);
  });

  it('fullUser bo\'lmasa ham (kutilmagan javob) REGULAR_LIMITS qaytaradi', async () => {
    const client = { invoke: vi.fn().mockResolvedValue({}) };
    const limits = await getAccountLimits(client);
    expect(limits).toEqual(REGULAR_LIMITS);
  });
});
