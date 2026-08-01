import { extractFirstPhone } from '../../../extract/phone.js';

// Telegram user_id odatda 6-12 xonali son.
const USER_ID_RE = /\b(\d{6,12})\b/;
// "Ism: XXX" / "Имя: XXX" / "Name: XXX" naqshi — aniq label bo'lmasa ism
// ajratilmaydi (taxmin qilish soxta musbatlarga olib keladi).
const NAME_LABEL_RE = /(?:ism|имя|name)\s*[:\-]\s*([^\n\r]+)/i;

// "Qidirilmoqda..." kabi oraliq/holat xabarlarini yakuniy javobdan ajratish
// uchun — botBridge shu funksiyani javobning "yakuniy"ligini aniqlash uchun
// standart sifatida ishlatadi (parser bot-specific bo'lsa o'ziniki bilan
// almashtirishi mumkin).
const TRANSIENT_RE = /(⏳|qidirilmoqda|kutib turing|please\s*wait|идёт поиск|поиск\.\.\.|searching)/i;

export function isLikelyFinalMessage(text) {
  if (!text) return false;
  return !TRANSIENT_RE.test(text);
}

/**
 * Konfiguratsiyalanadigan regex-asosli parser — bot javobining aniq
 * formati noma'lum bo'lganda ishlatiladigan zaxira. Faqat telefon, ism
 * (label bilan) va user_id'ni ajratishga urinadi.
 */
export function parseGeneric(text) {
  if (!text) return { found: false, phone: null, user_id: null, first_name: null, last_name: null };

  const phone = extractFirstPhone(text);
  const userIdMatch = text.match(USER_ID_RE);
  const nameMatch = text.match(NAME_LABEL_RE);

  return {
    found: Boolean(phone),
    phone: phone || null,
    user_id: userIdMatch ? userIdMatch[1] : null,
    first_name: nameMatch ? nameMatch[1].trim() : null,
    last_name: null,
  };
}

export default { parseGeneric, isLikelyFinalMessage };
