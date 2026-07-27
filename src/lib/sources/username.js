/**
 * Foydalanuvchi kiritgan manzilni (`@username`, `t.me/username`,
 * `https://t.me/username`, yoki xom `username`) toza `username`ga keltiradi.
 */
export function sanitizeUsername(input) {
  if (!input) return null;
  let value = String(input).trim();
  if (!value) return null;
  value = value.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '');
  value = value.replace(/^@/, '');
  value = value.split(/[/?#]/)[0].trim();
  return value || null;
}

export default { sanitizeUsername };
