// GramJS orqali to'g'ridan-to'g'ri Telegram'dan (getEntity) qidirish —
// AVVAL src/api/outreachRoutes.js dagi POST /lookup-phone ichida edi, shu
// yerga ko'chirildi (nusxa emas — o'sha endpoint endi shu modulga proxy
// qiladi). Xulq-atvor o'zgarishsiz: har chaqiruv o'ziga alohida qisqa
// umrli TelegramClient ochadi va yopadi.
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from '../../config/index.js';
import { TelegramAccount } from '../../db/models.js';

export const PROVIDER_NAME = 'gramjs';

export async function lookupViaGramjs(query) {
  const account = await TelegramAccount.findOne({ where: { status: 'active' } });
  if (!account) {
    const err = new Error("Aktiv Telegram akkount yo'q. Avval akkount qo'shing va verify qiling.");
    err.code = 'GRAMJS_NO_ACCOUNT';
    throw err;
  }

  const cleanQuery = query.trim().replace(/^@/, '');
  const client = new TelegramClient(
    new StringSession(account.session_string),
    config.telegram.apiId,
    config.telegram.apiHash,
    { connectionRetries: 2 }
  );
  await client.connect();

  try {
    let entity;
    try {
      entity = await client.getEntity(cleanQuery);
    } catch (err) {
      return {
        found: false,
        phone: null,
        username: cleanQuery,
        user_id: null,
        first_name: null,
        last_name: null,
        is_bot: false,
        provider: PROVIDER_NAME,
        confidence: 'verified',
        source_note: null,
      };
    }

    const phone = entity.phone ? `+${entity.phone}` : null;
    return {
      found: Boolean(phone),
      phone,
      username: entity.username || cleanQuery,
      user_id: entity.id?.toString() || null,
      first_name: entity.firstName || null,
      last_name: entity.lastName || null,
      is_bot: entity.bot || false,
      provider: PROVIDER_NAME,
      // GramJS'ning javobi to'g'ridan-to'g'ri Telegram'ning o'zidan — real
      // vaqtda, snapshot emas.
      confidence: 'verified',
      source_note: null,
    };
  } finally {
    await client.disconnect();
  }
}

export default { lookupViaGramjs, PROVIDER_NAME };
