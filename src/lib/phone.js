import crypto from 'node:crypto';

// Guruh lead'lar moduli o'zining mustaqil telefon parseriga ega —
// src/extract/phone.js (kanal skanerlash moduli) bilan bir xil davlat
// (O'zbekiston) uchun ishlaydi, lekin bu yerda ochiq kanal/guruh
// xabarlaridan yig'ilgan matn ko'proq soxta musbat (narx, maydon, sana,
// qavat) ehtimoliga ega bo'lgani uchun qo'shimcha kontekst filtri bor
// (pastda REJECT_CONTEXT_RE/OVERRIDE_RE) — shu sababli alohida saqlanadi.

// Mobil operator kodlari (+998 dan keyingi 2 raqam).
const MOBILE_CODES = ['90', '91', '93', '94', '95', '97', '98', '99', '88', '77', '33', '20'];
// Shahar/hudud (statsionar) kodlari — uzunlik jihatidan mobil bilan bir xil
// (2 xonali kod + 7 xonali raqam = 9 xona), shuning uchun validatsiya bitta
// birlashtirilgan ro'yxat orqali amalga oshiriladi.
const CITY_CODES = ['61', '62', '65', '66', '67', '69', '71', '72', '73', '74', '75', '76', '78', '79'];
const VALID_CODES = new Set([...MOBILE_CODES, ...CITY_CODES]);

// Raqam "kandidati" — ixtiyoriy `+`, so'ng ajratuvchi (bo'sh joy, tire,
// nuqta, qavs) bilan aralashgan raqamlar ketma-ketligi. Harflar (masalan
// "so'm", "yil", "qavat") ushbu belgilar sinfiga kirmagani uchun ular bilan
// tutashgan raqam ketma-ketliklari avtomatik uzilib qoladi — "2019 yil" yoki
// "4/9 qavat" kabi holatlar shu sabab kandidat bo'la olmaydi ("/" ham ruxsat
// etilgan belgilar orasida yo'q).
const CANDIDATE_RE = /\+?[\d][\d\s\-.()]{7,16}\d/g;

// Kandidat atrofida (12 belgi oldin/keyin) shu so'zlardan biri bo'lsa —
// bu ehtimol narx/maydon/sana/qavat, telefon emas (masalan "120 000 000
// so'm", "65 m2 kv", "2019 yil"). 9 xonali (davlat kodisiz) kandidatlarga
// qo'llaniladi — +998/998 bilan boshlangan yoki "tel" kabi aniq belgisi bor
// kandidatlar OVERRIDE_RE orqali bu tekshiruvdan mustasno.
const REJECT_CONTEXT_RE = /(so['`’ʻ]?m|сум|m2|кв\.?\s?m|kv\.?\s?m|qavat|этаж|yil\b|йил|foiz|%|dona|litr|\bkg\b)/i;
const OVERRIDE_RE = /(\+?998|\btel\b|telefon|phone|whatsapp|тел\b|звонить|звоните)/i;

function onlyDigits(value) {
  return (value == null ? '' : String(value)).replace(/\D/g, '');
}

/**
 * Bitta kandidatni (yoki oldindan tozalangan raqamni) E.164 formatiga
 * (+998XXXXXXXXX) normalizatsiya qiladi. Operator/hudud kodi yaroqsiz
 * bo'lsa yoki uzunlik mos kelmasa — null.
 */
export function normalizePhone(input) {
  const digits = onlyDigits(input);
  if (!digits) return null;

  // To'liq, davlat kodi bilan: +998XXXXXXXXX / 998XXXXXXXXX (12 xona)
  if (digits.startsWith('998') && digits.length === 12) {
    const code = digits.slice(3, 5);
    return VALID_CODES.has(code) ? `+${digits}` : null;
  }

  // Ichki uzunlik xatosi bilan: 0-998-XXXXXXXXX (13 xona, ortiqcha 0)
  if (digits.startsWith('0') && digits.length === 13 && digits.slice(1, 4) === '998') {
    const code = digits.slice(4, 6);
    return VALID_CODES.has(code) ? `+998${digits.slice(4)}` : null;
  }

  // Davlat kodisiz, faqat 9 xonali (kod + 7 xonali raqam)
  if (digits.length === 9) {
    const code = digits.slice(0, 2);
    return VALID_CODES.has(code) ? `+998${digits}` : null;
  }

  return null;
}

/**
 * Matndan barcha yaroqli O'zbekiston telefon raqamlarini topadi
 * (dublikatsiz, E.164 formatida). Narx/maydon/sana/qavat kabi soxta
 * musbatlarni operator kod validatsiyasi + atrofdagi matn konteksti orqali
 * chetlab o'tadi.
 */
export function extractPhones(text) {
  if (!text) return [];
  const found = new Set();

  for (const match of text.matchAll(CANDIDATE_RE)) {
    const candidate = match[0];
    const normalized = normalizePhone(candidate);
    if (!normalized) continue;

    const digits = onlyDigits(candidate);
    const hasExplicitCountryCode = digits.startsWith('998') || candidate.trim().startsWith('+');

    if (!hasExplicitCountryCode) {
      const start = match.index ?? text.indexOf(candidate);
      const end = start + candidate.length;
      const window = text.slice(Math.max(0, start - 12), start) + text.slice(end, end + 12);
      if (REJECT_CONTEXT_RE.test(window) && !OVERRIDE_RE.test(window)) continue;
    }

    found.add(normalized);
  }

  return Array.from(found);
}

/**
 * E.164 raqamni odam o'qiy oladigan formatga keltiradi: +998 90 123 45 67.
 * Kutilgan formatda bo'lmasa o'zgarishsiz qaytaradi.
 */
export function formatPhone(e164) {
  const digits = onlyDigits(e164);
  if (digits.length !== 12 || !digits.startsWith('998')) return e164;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
}

/**
 * E.164 raqamning SHA256 xeshini qaytaradi (Telegram Ads Custom Audience
 * "hashed" eksporti uchun). Har doim bir xil (normalizatsiya qilingan)
 * formatdan hisoblanadi — aks holda bir xil raqam turli yozilishda turli
 * xeshga tushib, Telegram tomonida moslik nolga tushardi.
 */
export function sha256Phone(e164) {
  return crypto.createHash('sha256').update(e164).digest('hex');
}

export default { extractPhones, normalizePhone, formatPhone, sha256Phone };
