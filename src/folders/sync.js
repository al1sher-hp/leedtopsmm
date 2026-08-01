import { Op } from 'sequelize';
import { getPool } from '../telegram/client.js';
import { Folder, FolderMember } from '../db/models.js';
import { listFolders } from './client.js';

// Telegram'dagi barcha (tizim "Barchasi"dan tashqari) jildlarni o'qib, Folder
// jadvaliga upsert qiladi. `managed_by_us` va `rule_json` HECH QACHON bu
// yerda o'zgartirilmaydi — faqat title/emoticon/peer_count/last_synced_at
// kabi Telegram'dan o'qiladigan sof metadata yangilanadi. Bizning
// applyRule() orqali (managed_by_us=true bilan) yaratilgan jildlar allaqachon
// DB'da mavjud bo'lgani uchun findOrCreate ularni qayta yaratmaydi; hali
// bizga notanish (foydalanuvchi Telegram ilovasida qo'lda yaratgan) jildlar
// esa managed_by_us=false bilan birinchi marta shu yerda paydo bo'ladi.
export async function syncFromTelegram() {
  const pool = await getPool();
  const remote = await listFolders(pool);

  const rows = [];
  for (const f of remote) {
    if (f.isDefault) continue;
    const [row, created] = await Folder.findOrCreate({
      where: { tg_filter_id: f.id },
      defaults: {
        title: f.title,
        emoticon: f.emoticon,
        peer_count: f.peer_count,
        managed_by_us: false,
        last_synced_at: new Date(),
      },
    });
    if (!created) {
      await row.update({
        title: f.title,
        emoticon: f.emoticon,
        peer_count: f.peer_count,
        last_synced_at: new Date(),
      });
    }
    rows.push(row);
  }
  return rows;
}

// Berilgan jildning Telegram'dagi HOZIRGI a'zolarini o'qib, FolderMember
// jadvalini shu holatga moslashtiradi (endi yo'qlari o'chiriladi, yangilari
// qo'shiladi). Eslatma: bu jadval "hozir Telegram jildida kim bor" degan
// joriy ko'rinishni aks ettiradi — qoida (rule_json) mos kelgan TO'LIQ
// (cheklovsiz) ro'yxat bu yerda emas, DialogContact so'rovi (rules.js
// resolveRule()) orqali istalgan vaqt qayta hisoblanadi.
export async function syncMembers(folderId) {
  const folder = await Folder.findByPk(folderId);
  if (!folder) throw new Error('Jild topilmadi');
  if (!folder.tg_filter_id) return [];

  const pool = await getPool();
  const remote = await listFolders(pool);
  const match = remote.find((f) => !f.isDefault && f.id === folder.tg_filter_id);
  if (!match) return [];

  // Faqat shaxsiy foydalanuvchilar (PeerUser) — jildda kanal/guruh ham
  // bo'lishi mumkin, lekin DialogContact/FolderMember faqat odamlar uchun.
  const tgUserIds = (match.raw.includePeers || [])
    .filter((p) => p.className === 'PeerUser')
    .map((p) => p.userId?.toString())
    .filter(Boolean);

  const now = new Date();
  for (const tgUserId of tgUserIds) {
    await FolderMember.findOrCreate({
      where: { folder_id: folder.id, tg_user_id: tgUserId },
      defaults: { added_at: now },
    });
  }

  if (tgUserIds.length > 0) {
    await FolderMember.destroy({
      where: { folder_id: folder.id, tg_user_id: { [Op.notIn]: tgUserIds } },
    });
  } else {
    await FolderMember.destroy({ where: { folder_id: folder.id } });
  }

  await folder.update({ peer_count: tgUserIds.length, last_synced_at: now });

  return FolderMember.findAll({ where: { folder_id: folder.id } });
}

export default { syncFromTelegram, syncMembers };
