// Pipeline (routes.js) va Kanal skanerlash (scanRoutes.js) ikkalasi ham
// foydalanuvchidan kalit so'zlar ro'yxati qabul qiladi — tozalash mantig'i
// shu yerda markazlashgan.
export const MAX_KEYWORDS = 50;

/** Trim, bo'sh qatorlarni olib tashlash, aniq dublikatlarni birlashtirish. */
export function sanitizeKeywords(raw) {
  if (!Array.isArray(raw)) return [];
  const trimmed = raw.map((k) => String(k ?? '').trim()).filter(Boolean);
  return [...new Set(trimmed)];
}

export default { sanitizeKeywords, MAX_KEYWORDS };
