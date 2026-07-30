import { Api } from 'telegram';
import { getPool } from '../telegram/client.js';
import { DialogContact, JobRun } from '../db/models.js';
import { dialogsSyncCancellation } from '../jobs/dialogsSyncCancellation.js';

// Telegram bir so'rovda ko'pi bilan ~100 ta dialog qaytaradi — kattaroq
// `limit` so'ralsa ham shu hajmda sahifalanadi.
const PAGE_SIZE = 100;

function peerToInputPeer(peer, usersById, chatsById) {
  if (peer?.className === 'PeerUser') {
    const user = usersById.get(peer.userId.toString());
    return user
      ? new Api.InputPeerUser({ userId: user.id, accessHash: user.accessHash })
      : new Api.InputPeerEmpty();
  }
  if (peer?.className === 'PeerChat') {
    return new Api.InputPeerChat({ chatId: peer.chatId });
  }
  if (peer?.className === 'PeerChannel') {
    const chat = chatsById.get(peer.channelId.toString());
    return chat
      ? new Api.InputPeerChannel({ channelId: chat.id, accessHash: chat.accessHash })
      : new Api.InputPeerEmpty();
  }
  return new Api.InputPeerEmpty();
}

// Bitta User-dialogni DialogContact'ga yozadi (upsert — hech qachon
// o'chirilmaydi). `opted_out=true` bo'lgan mavjud yozuvga HECH QANDAY maydon
// tegilmaydi — foydalanuvchi "menga yozmang" deb belgilagan bo'lsa, keyingi
// sinxronizatsiyalar uni qayta faollashtira olmaydi.
//
// Eslatma (message_count): Telegram getDialogs har bir dialog uchun faqat
// ENG SO'NGGI xabarni beradi — to'liq tarixiy son olish uchun har bir dialog
// bo'yicha alohida GetHistory chaqirish kerak bo'lardi (500 ta dialog uchun
// juda qimmat/sekin, ban xavfini oshiradi). Shu sababli message_count/
// my_message_count faqat YANGI kontakt birinchi marta ko'rilganda, mavjud
// top xabar asosida (bor/yo'q, chiquvchi/kiruvchi) INITSIALIZATSIYA qilinadi;
// mavjud kontaktda bu ustunlar keyingi (masalan real vaqtli xabar kuzatuvchi)
// bosqichlarga qoldirilib, bu yerda qayta yozilmaydi.
export async function upsertDialogContact(user, { lastMessageAt, topMessage } = {}, stats) {
  const tgUserId = user.id.toString();
  const existing = await DialogContact.findOne({ where: { tg_user_id: tgUserId } });

  if (existing?.opted_out) {
    if (stats) stats.skipped_opted_out += 1;
    return existing;
  }

  const fields = {
    username: user.username || null,
    first_name: user.firstName || null,
    last_name: user.lastName || null,
    is_bot: Boolean(user.bot),
    is_premium: Boolean(user.premium),
    is_contact: Boolean(user.contact),
    is_mutual_contact: Boolean(user.mutualContact),
    last_message_at: lastMessageAt || null,
  };

  // Faqat Telegram o'zi ochiq bergan telefon yoziladi — bo'lmasa mavjud
  // qiymat (masalan keyinroq tashqi lookup orqali topilgan) buzilmaydi.
  if (user.phone) {
    fields.phone = `+${user.phone}`;
    fields.phone_source = 'telegram';
  }

  if (existing) {
    await existing.update(fields);
    if (stats) stats.updated += 1;
    return existing;
  }

  const created = await DialogContact.create({
    tg_user_id: tgUserId,
    ...fields,
    message_count: topMessage ? 1 : 0,
    my_message_count: topMessage?.out ? 1 : 0,
  });
  if (stats) stats.created += 1;
  return created;
}

// Asosiy sahifalash+yozish sikli — `pool` tashqaridan uzatiladi (test'larda
// haqiqiy Telegram ulanishisiz mock bilan almashtiriladi), `job` esa
// progress/holatni saqlaydigan JobRun yozuvi.
export async function runDialogsSync(pool, job, { limit = 500, since = null } = {}) {
  const stats = { scanned: 0, created: 0, updated: 0, skipped_opted_out: 0, failed: 0 };
  const sinceDate = since ? new Date(since) : null;

  let offsetDate = 0;
  let offsetId = 0;
  let offsetPeer = new Api.InputPeerEmpty();
  let examined = 0;
  let cancelled = false;

  const persistProgress = (status) =>
    job.update({
      status,
      total: examined,
      done: stats.scanned,
      ok_count: stats.created + stats.updated,
      failed_count: stats.failed,
    });

  try {
    while (examined < limit) {
      dialogsSyncCancellation.throwIfCancelled();

      const batchLimit = Math.min(PAGE_SIZE, limit - examined);
      const result = await pool.invoke(
        new Api.messages.GetDialogs({ offsetDate, offsetId, offsetPeer, limit: batchLimit, hash: 0n }),
        { cancellationToken: dialogsSyncCancellation }
      );

      const dialogs = result.dialogs || [];
      if (dialogs.length === 0) break;

      const usersById = new Map((result.users || []).map((u) => [u.id.toString(), u]));
      const chatsById = new Map((result.chats || []).map((c) => [c.id.toString(), c]));
      const messagesById = new Map((result.messages || []).map((m) => [m.id, m]));

      let hitSinceCutoff = false;

      for (const dialog of dialogs) {
        examined += 1;
        const topMessage = messagesById.get(dialog.topMessage);
        const lastMessageAt = topMessage?.date ? new Date(topMessage.date * 1000) : null;

        if (sinceDate && lastMessageAt && lastMessageAt < sinceDate) {
          // Dialoglar eng so'nggidan eskisiga qarab keladi — bittasi eskirsa
          // qolganlari ham eskiroq, shuning uchun butunlay to'xtatish mumkin.
          hitSinceCutoff = true;
          break;
        }

        // FAQAT User (shaxsiy) dialoglar — kanal/guruh o'tkazib yuboriladi.
        // Bot bo'lgan foydalanuvchilar HAM yoziladi (is_bot orqali belgilanib).
        if (dialog.peer?.className === 'PeerUser') {
          const user = usersById.get(dialog.peer.userId.toString());
          if (user) {
            stats.scanned += 1;
            try {
              await upsertDialogContact(user, { lastMessageAt, topMessage }, stats);
            } catch (err) {
              stats.failed += 1;
              console.error(`[dialogs] ${user.id} uchun xato:`, err.message);
            }
          }
        }
      }

      await persistProgress('running');

      if (hitSinceCutoff || dialogs.length < batchLimit || examined >= limit) break;

      const lastDialog = dialogs[dialogs.length - 1];
      const lastMsg = messagesById.get(lastDialog.topMessage);
      offsetDate = lastMsg?.date || offsetDate;
      offsetId = lastDialog.topMessage || offsetId;
      offsetPeer = peerToInputPeer(lastDialog.peer, usersById, chatsById);
    }

    await persistProgress('completed');
  } catch (err) {
    if (err.isCancellation) {
      cancelled = true;
      await persistProgress('cancelled');
    } else {
      await job.update({ status: 'failed', error_message: err.message });
      throw err;
    }
  }

  return { cancelled, ...stats };
}

/**
 * Userbot'ning shaxsiy dialoglarini o'qib DialogContact'ga yozadi.
 * `limit` — ko'rib chiqiladigan dialoglar (barcha turdagi) umumiy soni,
 * `since` — berilsa, oxirgi xabari shu sanadan eski bo'lgan dialogga
 * yetilganda sinxronizatsiya to'xtaydi.
 *
 * Og'ir Telegram ishi FON REJIMIDA ishlaydi (folders/rules.js dagi
 * applyRule bilan bir xil "start + poll" naqshi) — JobRun darhol yaratiladi
 * va uning id'si qaytadi, chaqiruvchi (masalan API route) holatni keyinroq
 * shu JobRun orqali kuzatishi mumkin.
 */
export async function syncDialogs({ limit = 500, since = null } = {}) {
  const pool = await getPool();
  dialogsSyncCancellation.reset();

  const job = await JobRun.create({
    kind: 'dialogs_sync',
    status: 'running',
    params_json: { limit, since },
  });

  const donePromise = runDialogsSync(pool, job, { limit, since });

  return { jobId: job.id, donePromise };
}

export default { syncDialogs, runDialogsSync, upsertDialogContact };
