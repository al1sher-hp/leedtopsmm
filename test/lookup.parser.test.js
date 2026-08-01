import { describe, it, expect } from 'vitest';
import { parseGeneric, isLikelyFinalMessage } from '../src/lookup/bridge/parsers/generic.js';
import { parseTelefonRaqamTopishbot } from '../src/lookup/bridge/parsers/telefonRaqamTopishbot.js';

describe('parseGeneric — turli javob shakllari', () => {
  it('1) "Ism: ... Telefon: ..." formatini taniydi', () => {
    const r = parseGeneric('Ism: John Doe\nTelefon: +998901234567');
    expect(r.found).toBe(true);
    expect(r.phone).toBe('+998901234567');
    expect(r.first_name).toBe('John Doe');
  });

  it('2) Rus tilidagi "Имя:" formatini taniydi', () => {
    const r = parseGeneric('Имя: Иван\nТелефон: +998901234567');
    expect(r.found).toBe(true);
    expect(r.first_name).toBe('Иван');
  });

  it("3) Telefon bo'lmasa found:false", () => {
    const r = parseGeneric('Salom, nima gap?');
    expect(r.found).toBe(false);
    expect(r.phone).toBeNull();
  });

  it("4) Gap ichiga singib ketgan raqamni ham topadi", () => {
    const r = parseGeneric('Uning raqami: +998 90 123 45 67 ekan');
    expect(r.phone).toBe('+998901234567');
  });

  it('5) user_id ni alohida ajratadi', () => {
    const r = parseGeneric('ID: 123456789\nTelefon: +998901234567');
    expect(r.user_id).toBe('123456789');
    expect(r.phone).toBe('+998901234567');
  });

  it('6) "Ism - John" (tire ajratuvchi) formatini taniydi', () => {
    const r = parseGeneric('Ism - John\nTelefon: +998901234567');
    expect(r.first_name).toBe('John');
  });

  it("7) matnda bir nechta raqam bo'lsa birinchisini oladi", () => {
    const r = parseGeneric('+998901234567 yoki +998907654321');
    expect(r.phone).toBe('+998901234567');
  });

  it("8) faqat ID bor, telefon yo'q bo'lsa found:false lekin user_id bor", () => {
    // 10 xonali ID ataylab tanlangan — 9 xonali UZ operator-kod naqshiga
    // (masalan 987654321) tasodifan mos kelib, telefon deb noto'g'ri
    // aniqlanib qolmasligi uchun.
    const r = parseGeneric('ID: 1234567890, telefon topilmadi');
    expect(r.found).toBe(false);
    expect(r.user_id).toBe('1234567890');
  });

  it("9) bo'sh/null matn uchun xavfsiz", () => {
    expect(parseGeneric('').found).toBe(false);
    expect(parseGeneric(null).found).toBe(false);
  });

  it('10) yaroqsiz (UZ operator kodiga mos kelmagan) raqamni rad etadi', () => {
    const r = parseGeneric('Telefon: +998001234567');
    expect(r.found).toBe(false);
  });
});

describe('isLikelyFinalMessage', () => {
  it('"⏳ Qidirilmoqda..." kabi holat xabarlarini yakuniy emas deb topadi', () => {
    expect(isLikelyFinalMessage('⏳ Qidirilmoqda...')).toBe(false);
    expect(isLikelyFinalMessage('Iltimos kutib turing')).toBe(false);
    expect(isLikelyFinalMessage('Идёт поиск...')).toBe(false);
  });

  it('oddiy javob matnini yakuniy deb topadi', () => {
    expect(isLikelyFinalMessage('Ism: John\nTelefon: +998901234567')).toBe(true);
  });

  it("bo'sh matnni yakuniy emas deb topadi", () => {
    expect(isLikelyFinalMessage('')).toBe(false);
    expect(isLikelyFinalMessage(null)).toBe(false);
  });
});

describe('parseTelefonRaqamTopishbot', () => {
  it('generic parserga tayanadi', () => {
    const r = parseTelefonRaqamTopishbot('Ism: John\nTelefon: +998901234567');
    expect(r.found).toBe(true);
    expect(r.phone).toBe('+998901234567');
  });

  it("tanilmagan formatni unrecognized_format bilan belgilaydi", () => {
    const r = parseTelefonRaqamTopishbot('Bu allaqachon tushunarsiz bir narsa');
    expect(r.found).toBe(false);
    expect(r.unrecognized_format).toBe(true);
  });

  it("topilgan javobda unrecognized_format belgilanmaydi", () => {
    const r = parseTelefonRaqamTopishbot('Telefon: +998901234567');
    expect(r.unrecognized_format).toBeUndefined();
  });
});
