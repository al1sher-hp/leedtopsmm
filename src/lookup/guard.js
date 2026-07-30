import { Op } from 'sequelize';
import { isBlacklisted } from '../blacklist/blacklist.js';
import { DialogContact, LookupAudit } from '../db/models.js';
import config from '../config/index.js';

export class LookupNotAllowedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LookupNotAllowedError';
    this.code = code;
  }
}

// Cap FAQAT haqiqiy tashqi so'rovlarni (tgbot) sanaydi — 'cache' (real
// so'rov emas) va 'gramjs' (haqiqiy Telegram, xavfsiz) urinishlari xavfsiz
// bo'lgani uchun kunlik limitni bekorga to'ldirmasligi kerak.
async function countToday() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return LookupAudit.count({ where: { createdAt: { [Op.gte]: startOfDay }, provider: 'tgbot' } });
}

// HIMOYA #1/#2/#4: lookup ISHGA TUSHISHDAN OLDIN tekshiriladi (provider
// chaqirilmasdan) — qora ro'yxatdagi yoki opted_out belgilangan kontaktga
// hech qanday lookup so'rovi yuborilmaydi, kunlik cap tugagan bo'lsa butun
// tizim to'xtaydi. Ruxsat bo'lmasa aniq kodli xato tashlaydi (jimgina
// hech narsa qilmaslik yoki noaniq xato o'rniga).
export async function assertAllowed(query) {
  const target = query.trim().replace(/^@/, '');

  if (await isBlacklisted(target)) {
    throw new LookupNotAllowedError('LOOKUP_BLACKLISTED', `"${target}" qora ro'yxatda — lookup taqiqlangan`);
  }

  const contact = await DialogContact.findOne({
    where: { [Op.or]: [{ tg_user_id: target }, { username: target }] },
  });
  if (contact?.opted_out) {
    throw new LookupNotAllowedError('LOOKUP_OPTED_OUT', `"${target}" chiqarilgan (opted_out) — lookup taqiqlangan`);
  }

  const usedToday = await countToday();
  if (usedToday >= config.lookup.dailyCap) {
    throw new LookupNotAllowedError('LOOKUP_DAILY_CAP', `Kunlik lookup limiti (${config.lookup.dailyCap}) tugagan`);
  }
}

export default { assertAllowed, LookupNotAllowedError };
