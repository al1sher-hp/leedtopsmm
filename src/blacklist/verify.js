import { Api } from 'telegram';

/**
 * Berilgan @username'ni Telegram'da qidirib, blacklist yozuvi uchun kerakli
 * maydonlarni qaytaradi. Faqat ochiq kanal/guruh (username'li) yoki bot
 * qo'llab-quvvatlanadi — oddiy foydalanuvchi akkauntlari emas (bu tizim
 * hech qachon alohida shaxslarni maqsad qilmaydi, faqat kanal/guruh/botlarni).
 */
export async function resolveTarget(pool, username) {
  const resolved = await pool.invoke(new Api.contacts.ResolveUsername({ username }));

  const chat = resolved.chats?.[0];
  if (chat && chat.className === 'Channel') {
    return {
      target_type: chat.megagroup ? 'group' : 'channel',
      target_id: chat.id.toString(),
      target_username: chat.username || username,
      target_title: chat.title,
    };
  }

  const user = resolved.users?.[0];
  if (user) {
    if (!user.bot) {
      const err = new Error(
        "Faqat kanal, guruh yoki bot qora ro'yxatga qo'shilishi mumkin — oddiy foydalanuvchi akkaunti emas."
      );
      err.isUserAccount = true;
      throw err;
    }
    return {
      target_type: 'bot',
      target_id: user.id.toString(),
      target_username: user.username || username,
      target_title: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || username,
    };
  }

  throw new Error('Username topilmadi.');
}

/**
 * Tasdiqlash kodi qidirilishi kerak bo'lgan "About" matnini o'qiydi — kanal
 * va guruh uchun tavsif (faqat admin tahrirlay oladi), bot uchun BotFather
 * orqali qo'yilgan bot profili tavsifi (faqat bot egasi qo'yishi mumkin).
 */
export async function fetchAboutText(pool, { target_type, target_username }) {
  const resolved = await pool.invoke(new Api.contacts.ResolveUsername({ username: target_username }));

  if (target_type === 'bot') {
    const user = resolved.users?.[0];
    if (!user) throw new Error('Bot topilmadi.');
    const full = await pool.invoke(
      new Api.users.GetFullUser({ id: new Api.InputUser({ userId: user.id, accessHash: user.accessHash }) })
    );
    return full.fullUser?.about || '';
  }

  const chat = resolved.chats?.[0];
  if (!chat) throw new Error('Kanal/guruh topilmadi.');
  const full = await pool.invoke(
    new Api.channels.GetFullChannel({
      channel: new Api.InputChannel({ channelId: chat.id, accessHash: chat.accessHash }),
    })
  );
  return full.fullChat?.about || '';
}

export default { resolveTarget, fetchAboutText };
