import { extractFirstPhone, normalizePhoneCandidate } from '../../../extract/phone.js';

// @Telefon_raqam_topishbot haqiqiy javob formati:
//   🔍 Обнаружен логин: @username
//   ID: 7989135938
//   Телефон: 998976640798
//   История изменения имени:
//   05.08.2026 → @username ...
//
// Telefon label'dan avval qidiriladi; topilmasa umumiy extractFirstPhone ishlaydi.
// username change tarixidagi telefon raqamlarini chalkash deb qabul qilmaslik
// uchun faqat birinchi aniq "Телефон:" qatorini olamiz.

const PHONE_LABEL_RE = /Телефон\s*:\s*([\d\s+\-()]{6,20})/i;
const ID_LABEL_RE = /\bID\s*:\s*(\d{6,14})\b/i;
const LOGIN_RE = /обнаружен\s+логин\s*:\s*@?(\w+)/i;

export function parseTelefonRaqamTopishbot(text) {
  if (!text) {
    return { found: false, phone: null, user_id: null, first_name: null, last_name: null };
  }

  // "Телефон: XXXX" label bo'lsa — eng ishonchli manba
  let phone = null;
  const phoneLabel = text.match(PHONE_LABEL_RE);
  if (phoneLabel) {
    phone = normalizePhoneCandidate(phoneLabel[1]);
  }
  // Label topilmasa, matndan birinchi UZ raqamni qidirish
  if (!phone) {
    phone = extractFirstPhone(text);
  }

  const idMatch = text.match(ID_LABEL_RE);
  const loginMatch = text.match(LOGIN_RE);

  return {
    found: Boolean(phone),
    phone: phone || null,
    user_id: idMatch ? idMatch[1] : null,
    first_name: null,
    last_name: null,
    username: loginMatch ? loginMatch[1] : null,
    unrecognized_format: !phone && !idMatch,
  };
}

export default { parseTelefonRaqamTopishbot };
