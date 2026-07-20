import { describe, it, expect } from 'vitest';
import { extractPhones, extractFirstPhone, normalizePhoneCandidate } from '../src/extract/phone.js';

describe('normalizePhoneCandidate', () => {
  it('normalizes a full +998 number with a valid operator code', () => {
    expect(normalizePhoneCandidate('+998901234567')).toBe('+998901234567');
  });

  it('normalizes a number without the leading +', () => {
    expect(normalizePhoneCandidate('998901234567')).toBe('+998901234567');
  });

  it('normalizes a 9-digit number without country code', () => {
    expect(normalizePhoneCandidate('901234567')).toBe('+998901234567');
  });

  it('rejects an invalid operator code', () => {
    expect(normalizePhoneCandidate('+998121234567')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(normalizePhoneCandidate('abc')).toBeNull();
    expect(normalizePhoneCandidate('')).toBeNull();
  });
});

describe('extractPhones', () => {
  it('finds multiple distinct phones in free text', () => {
    const text = "Buyurtma uchun: +998 90 123-45-67 yoki 998901234568 ga qo'ng'iroq qiling";
    expect(extractPhones(text)).toEqual(['+998901234567', '+998901234568']);
  });

  it('deduplicates repeated phones', () => {
    const text = '+998901234567 ... +998901234567';
    expect(extractPhones(text)).toEqual(['+998901234567']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(extractPhones('bu yerda raqam yo\'q')).toEqual([]);
    expect(extractPhones(null)).toEqual([]);
  });
});

describe('extractFirstPhone', () => {
  it('returns the first valid phone found', () => {
    const text = '+998901234567 va +998911234567';
    expect(extractFirstPhone(text)).toBe('+998901234567');
  });

  it('returns null when no phone is present', () => {
    expect(extractFirstPhone('kontakt yo\'q')).toBeNull();
  });
});
