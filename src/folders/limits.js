import { Api } from 'telegram';

// Telegram jild (Dialog Filter) limitlari — hujjatlashtirilgan standart
// qiymatlar: oddiy akkaunt 10 ta jild / jildda 100 ta chat, Premium akkaunt
// 20 ta jild / jildda 200 ta chat.
export const REGULAR_LIMITS = { maxFolders: 10, maxPeersPerFolder: 100 };
export const PREMIUM_LIMITS = { maxFolders: 20, maxPeersPerFolder: 200 };

// Akkauntning premium holatini `users.getFullUser` orqali aniqlaydi. `client`
// — `.invoke(request)` metodiga ega istalgan obyekt (odatda src/telegram/
// client.js dagi pool yoki uning bitta sessiyasi), shunda chaqiruv
// rate-limit/FloodWait himoyasidan avtomatik o'tadi. Holat aniqlanmasa
// (tarmoq xatosi va h.k.) — XAVFSIZ TOMONGA: oddiy akkaunt limitlari
// qo'llanadi, shunda haddan tashqari ko'p peer yozib Telegram tomonidan rad
// etilish xavfi bo'lmaydi.
export async function getAccountLimits(client) {
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
    const isPremium = Boolean(full?.fullUser?.premium);
    return isPremium ? { ...PREMIUM_LIMITS } : { ...REGULAR_LIMITS };
  } catch (err) {
    console.warn(`[folders] premium holatini aniqlab bo'lmadi, oddiy akkaunt limitlari qo'llanadi: ${err.message}`);
    return { ...REGULAR_LIMITS };
  }
}

// Yangi jild qo'shishdan oldingi tekshiruv — limitga yetgan bo'lsa aniq
// Uzbek xabar bilan to'xtatadi (jimgina hech narsa qilmaslik yoki noaniq
// Telegram xatosiga yo'l qo'yish o'rniga).
export function assertCanAddFolder(currentCount, limits) {
  if (currentCount >= limits.maxFolders) {
    throw new Error(
      `Jild limiti tugagan: ${limits.maxFolders} tadan ortiq jild yaratib bo'lmaydi. Avval keraksiz jildni o'chiring.`
    );
  }
}

// 500 ta kontakt bitta jildga sig'MAYDI — birinchi `limits.maxPeersPerFolder`
// tasi jildga joylanadi (`fit`), qolgani `overflow`da qaytariladi. Bu yerda
// HECH NARSA jimgina tashlab yuborilmaydi — chaqiruvchi (rules.js/routes)
// `overflow`ni albatta hisoblab, foydalanuvchiga ko'rsatishi kerak.
export function splitToLimit(peers, limits) {
  const fit = peers.slice(0, limits.maxPeersPerFolder);
  const overflow = peers.slice(limits.maxPeersPerFolder);
  return { fit, overflow };
}

export default { getAccountLimits, assertCanAddFolder, splitToLimit, REGULAR_LIMITS, PREMIUM_LIMITS };
