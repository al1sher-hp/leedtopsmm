import { Op } from 'sequelize';
import { PhoneLookup } from '../db/models.js';
import config from '../config/index.js';

function normalizeQuery(query) {
  return query.trim().replace(/^@/, '').toLowerCase();
}

// Muddati o'tmagan (expires_at > now) eng so'nggi natijani qaytaradi —
// topilmasa null (bu holda chaqiruvchi provider zanjirini ishga tushiradi).
export async function get(query) {
  const contact_value = normalizeQuery(query);
  return PhoneLookup.findOne({
    where: { contact_value, expires_at: { [Op.gt]: new Date() } },
    order: [['createdAt', 'DESC']],
  });
}

// HIMOYA #5: raqamlar TTL bilan o'chadi — snapshot bazadan kelgan (eski
// bo'lishi mumkin) ma'lumot abadiy saqlanmaydi, `LOOKUP_CACHE_TTL_DAYS`dan
// keyin muddati tugaydi (purgeExpired() haqiqatan o'chiradi).
export async function put(query, result) {
  const contact_value = normalizeQuery(query);
  const expires_at = new Date(Date.now() + config.lookup.cacheTtlDays * 24 * 60 * 60 * 1000);

  return PhoneLookup.create({
    contact_type: 'username',
    contact_value,
    phone: result.phone || null,
    tg_user_id: result.user_id || null,
    first_name: result.first_name || null,
    last_name: result.last_name || null,
    is_bot: Boolean(result.is_bot),
    provider: result.provider || null,
    found: Boolean(result.found),
    confidence: result.confidence || null,
    raw_response: result.raw_response || null,
    source_note: result.source_note || null,
    expires_at,
  });
}

// Kunlik interval bilan chaqiriladi (src/api/app.js -> startLookupPurge()):
// 1) muddati o'tgan (expires_at <= now), hali tozalanmagan (purged_at: null)
//    qatorlarning FAQAT nozik maydonlarini (phone, raw_response) tozalaydi
//    va `purged_at`ni belgilaydi — qator O'ZI o'chirilmaydi. Shunda "bu
//    so'rov qidirilgan edi" fakti (audit/tarix uchun) saqlanib qoladi,
//    raqamning o'zi esa 30 kundan keyin yo'q bo'ladi. `purged_at: null`
//    sharti — allaqachon tozalangan qatorlarni har kuni qayta "yangilab"
//    (updatedAt'ini o'zgartirib) yubormaslik uchun.
// 2) hali muddati tugamagan, lekin `LOOKUP_RAW_RETENTION_DAYS`dan eski
//    qatorlarning faqat raw_response'ini tozalaydi (xom bot javobi uzoq
//    saqlanmasin — o'zi ham nozik ma'lumot bo'lishi mumkin).
export async function purgeExpired() {
  const [expiredCount] = await PhoneLookup.update(
    { phone: null, raw_response: null, purged_at: new Date() },
    { where: { expires_at: { [Op.lte]: new Date() }, purged_at: null } }
  );

  const rawCutoff = new Date(Date.now() - config.lookup.rawRetentionDays * 24 * 60 * 60 * 1000);
  const [rawCleared] = await PhoneLookup.update(
    { raw_response: null },
    { where: { raw_response: { [Op.ne]: null }, createdAt: { [Op.lte]: rawCutoff } } }
  );

  return { expiredCount, rawCleared };
}

export default { get, put, purgeExpired };
