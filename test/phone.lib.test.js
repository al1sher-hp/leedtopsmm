import { describe, it, expect } from 'vitest';
import { extractPhones, normalizePhone, formatPhone, sha256Phone } from '../src/lib/phone.js';

describe('normalizePhone — valid formats', () => {
  it('accepts +998XXXXXXXXX', () => {
    expect(normalizePhone('+998901234567')).toBe('+998901234567');
  });

  it('accepts 998XXXXXXXXX (no plus)', () => {
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });

  it('accepts "90 123 45 67" (9-digit, spaced)', () => {
    expect(normalizePhone('90 123 45 67')).toBe('+998901234567');
  });

  it('accepts "(90) 123-45-67" (parens + dashes)', () => {
    expect(normalizePhone('(90) 123-45-67')).toBe('+998901234567');
  });

  it('accepts "94-567-89-01" (dash-separated mobile code)', () => {
    expect(normalizePhone('94-567-89-01')).toBe('+998945678901');
  });

  it('accepts bare "901234567" (9-digit no separators)', () => {
    expect(normalizePhone('901234567')).toBe('+998901234567');
  });

  it('accepts a valid city/landline code (71)', () => {
    expect(normalizePhone('71 234 56 78')).toBe('+998712345678');
  });

  it('accepts the extra-zero variant (0-998-...)', () => {
    expect(normalizePhone('0998901234567')).toBe('+998901234567');
  });
});

describe('normalizePhone — invalid input', () => {
  it('rejects an invalid operator/area code', () => {
    expect(normalizePhone('+998121234567')).toBeNull();
    expect(normalizePhone('121234567')).toBeNull();
  });

  it('rejects garbage / empty input', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('rejects wrong-length digit strings', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('99890123456789')).toBeNull();
  });
});

describe('extractPhones — positive extraction', () => {
  it('finds a single phone in free text', () => {
    expect(extractPhones("kvartira sotiladi, +998 90 123 45 67")).toEqual(['+998901234567']);
  });

  it('finds multiple distinct phones and dedupes repeats', () => {
    const text = 'Bogloning: +998901234567 yoki 998911234568. Yana bir bor +998901234567.';
    expect(extractPhones(text).sort()).toEqual(['+998901234567', '+998911234568'].sort());
  });

  it('finds a bare 9-digit local number with an explicit "tel" marker', () => {
    expect(extractPhones('tel: 901234567')).toEqual(['+998901234567']);
  });

  it('finds a landline formatted with parens/dashes', () => {
    expect(extractPhones('Ofis: (71) 234-56-78 dan qo\'ng\'iroq qiling')).toEqual(['+998712345678']);
  });

  it('returns [] for empty/missing text', () => {
    expect(extractPhones('')).toEqual([]);
    expect(extractPhones(null)).toEqual([]);
    expect(extractPhones(undefined)).toEqual([]);
  });

  it('returns [] when no valid number is present', () => {
    expect(extractPhones("bu yerda raqam yo'q, faqat matn")).toEqual([]);
  });
});

describe('extractPhones — false positives (must NOT be treated as phones)', () => {
  it('rejects a price ("120 000 000 so\'m")', () => {
    expect(extractPhones("Kvartira narxi 120 000 000 so'm")).toEqual([]);
  });

  it('rejects an area in square meters ("65 m2")', () => {
    expect(extractPhones('Xonadon maydoni 65 m2')).toEqual([]);
  });

  it('rejects a bare year ("2019 yil")', () => {
    expect(extractPhones('2019 yil qurilgan')).toEqual([]);
  });

  it('rejects a floor fraction ("4/9 qavat")', () => {
    expect(extractPhones('4/9 qavat, yevroremont')).toEqual([]);
  });

  it('rejects a 9-digit price that coincidentally has a valid-looking prefix, when marked as a price', () => {
    expect(extractPhones("Narxi 901234567 so'm, kelishamiz")).toEqual([]);
  });

  it('does NOT reject the same digits when explicitly marked as a phone (+998 override)', () => {
    expect(extractPhones("Narxi kelishiladi. Tel: +998901234567")).toEqual(['+998901234567']);
  });

  it('does NOT reject a 9-digit number near "tel" even without a plus sign', () => {
    expect(extractPhones("Tel 901234567, narxi kelishiladi")).toEqual(['+998901234567']);
  });
});

describe('formatPhone', () => {
  it('formats an E.164 number into spaced groups', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('returns the input unchanged when not a recognizable E.164 number', () => {
    expect(formatPhone('not-a-phone')).toBe('not-a-phone');
  });
});

describe('sha256Phone', () => {
  it('is deterministic for the same E.164 input', () => {
    expect(sha256Phone('+998901234567')).toBe(sha256Phone('+998901234567'));
  });

  it('produces a 64-char hex digest', () => {
    expect(sha256Phone('+998901234567')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different phone numbers', () => {
    expect(sha256Phone('+998901234567')).not.toBe(sha256Phone('+998911234567'));
  });
});
