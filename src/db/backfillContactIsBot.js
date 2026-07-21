// Bir martalik backfill: contact_is_bot ustuni qo'shilishidan OLDIN yaratilgan
// (yoki oxirgi marta yangilangan) lead'larda bu maydon hisoblanmagan bo'lishi
// mumkin — pipeline allaqachon gemini_score bergan lead'larni qayta
// boyitmaydi (idempotentlik), shuning uchun ular hech qachon yangi
// contact_is_bot logikasidan o'tmagan. Bu skript contact_username'ni nomi
// bo'yicha (isLikelyBotUsername) qayta tekshirib, kerak bo'lsa to'g'irlaydi.
// Ishga tushirish: npm run backfill:bot
import { Op } from 'sequelize';
import sequelize from './index.js';
import { Lead } from './models.js';
import { isLikelyBotUsername } from '../extract/username.js';

async function backfill() {
  try {
    await sequelize.authenticate();
    console.log('[backfill:bot] DB ulanishi OK');

    const leads = await Lead.findAll({ where: { contact_username: { [Op.ne]: null } } });
    let updated = 0;

    for (const lead of leads) {
      const shouldBeBot = isLikelyBotUsername(lead.contact_username);
      if (shouldBeBot !== lead.contact_is_bot) {
        await lead.update({ contact_is_bot: shouldBeBot });
        updated += 1;
        console.log(
          `[backfill:bot] @${lead.contact_username} (${lead.channel_title}) -> contact_is_bot=${shouldBeBot}`
        );
      }
    }

    console.log(`[backfill:bot] tugadi: ${leads.length} ta tekshirildi, ${updated} ta yangilandi`);
    process.exit(0);
  } catch (err) {
    console.error('[backfill:bot] Xato:', err);
    process.exit(1);
  }
}

backfill();
