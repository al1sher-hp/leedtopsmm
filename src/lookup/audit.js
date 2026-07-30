import { LookupAudit } from '../db/models.js';

// +998901234567 -> +9989****4567. Faqat birinchi 5 va oxirgi 4 belgi
// ko'rsatiladi — to'liq raqam HECH QACHON audit jurnaliga yozilmaydi, aks
// holda audit jurnalining o'zi maxfiy ma'lumot manbaiga aylanib qolardi.
export function maskPhone(phone) {
  if (!phone) return null;
  if (phone.length <= 9) return '****';
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`;
}

/**
 * Har bir lookup urinishi (muvaffaqiyatli yoki yo'q) uchun audit yozuvi —
 * "MAJBURIY" himoya: kim, qachon, qaysi provider, nima uchun qidirgani doim
 * qayd etiladi. `phone` faqat niqoblash uchun uzatiladi, o'zi saqlanmaydi.
 */
export async function record({ query, queryType = 'username', provider, found, actor, purpose, phone }) {
  return LookupAudit.create({
    query_type: queryType,
    query_value: query,
    provider,
    found: Boolean(found),
    actor,
    purpose: purpose || null,
    result_phone_masked: maskPhone(phone),
  });
}

export default { record, maskPhone };
