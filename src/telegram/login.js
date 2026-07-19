// Bir martalik interaktiv SESSION string generator.
// Ishga tushirish: npm run login
// Telefon raqam va tasdiqlash kodini so'raydi, oxirida .env ga qo'yiladigan
// SESSION qatorini chiqaradi.

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import config from '../config/index.js';

async function main() {
  if (!config.telegram.apiId || !config.telegram.apiHash) {
    console.error('API_ID va API_HASH .env faylida to\'ldirilishi shart (my.telegram.org dan oling).');
    process.exit(1);
  }

  console.log('Telegram userbot login boshlanmoqda...');

  const client = new TelegramClient(
    new StringSession(''),
    config.telegram.apiId,
    config.telegram.apiHash,
    { connectionRetries: 5 }
  );

  await client.start({
    phoneNumber: async () => await input.text('Telefon raqamingiz (+998...): '),
    password: async () => await input.text('2FA parolingiz (agar yoqilgan bo\'lsa): '),
    phoneCode: async () => await input.text('Telegramdan kelgan kod: '),
    onError: (err) => console.error('Login xatosi:', err),
  });

  console.log('\nMuvaffaqiyatli login qilindi!\n');
  const sessionString = client.session.save();
  console.log('Quyidagi qatorni .env fayliga SESSION= qatoriga qo\'ying:\n');
  console.log(sessionString);
  console.log('\n');

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Login jarayonida xato:', err);
  process.exit(1);
});
