import { UZ_OPERATOR_CODES } from '../config/seeds.js';

// Strategiya: matndan "raqamga o'xshash" bo'laklarni bo'shroq regex bilan
// topamiz, so'ng har birini raqamlar darajasida qattiq validatsiya qilamiz.
// Bu ajratuvchilar (bo'sh joy, tire, qavs, nuqta) turlicha bo'lgan holatlarni
// ham qamrab oladi va soxta musbatlarni kamaytiradi.
const CANDIDATE_RE = /\+?[\d][\d\s\-.()]{7,16}\d/g;

function onlyDigits(str) {
  return str.replace(/\D/g, '');
}

/**
 * Bitta raqam kandidatini validatsiya qiladi va +998XXXXXXXXX formatiga
 * normalizatsiya qiladi. Yaroqsiz bo'lsa null qaytaradi.
 */
export function normalizePhoneCandidate(candidate) {
  let digits = onlyDigits(candidate);
  if (!digits) return null;

  // 998 bilan boshlanadigan holatlar (prefiksli, eng ishonchli)
  if (digits.startsWith('998') && digits.length === 12) {
    const operatorCode = digits.slice(3, 5);
    if (UZ_OPERATOR_CODES.includes(operatorCode)) {
      return `+${digits}`;
    }
    return null;
  }

  // Ba'zan +998 emas, 8-998 (ichki uzunlik) yoki ortiqcha 0 qo'shilgan bo'ladi
  if (digits.startsWith('0') && digits.length === 13 && digits.slice(1, 4) === '998') {
    const operatorCode = digits.slice(4, 6);
    if (UZ_OPERATOR_CODES.includes(operatorCode)) {
      return `+998${digits.slice(4)}`;
    }
    return null;
  }

  // Prefikssiz, faqat 9 xonali, operator kodi bilan boshlanadigan raqamlar
  if (digits.length === 9) {
    const operatorCode = digits.slice(0, 2);
    if (UZ_OPERATOR_CODES.includes(operatorCode)) {
      return `+998${digits}`;
    }
    return null;
  }

  return null;
}

/**
 * Matndan barcha yaroqli UZ telefon raqamlarini topadi (+998XXXXXXXXX
 * formatida, dublikatsiz).
 */
export function extractPhones(text) {
  if (!text) return [];
  const found = new Set();
  const matches = text.match(CANDIDATE_RE) || [];
  for (const candidate of matches) {
    const normalized = normalizePhoneCandidate(candidate);
    if (normalized) found.add(normalized);
  }
  return Array.from(found);
}

/**
 * Matndan birinchi topilgan yaroqli telefon raqamini qaytaradi (yoki null).
 */
export function extractFirstPhone(text) {
  const phones = extractPhones(text);
  return phones.length > 0 ? phones[0] : null;
}

export default { extractPhones, extractFirstPhone, normalizePhoneCandidate };
