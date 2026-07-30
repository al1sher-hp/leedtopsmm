import { Api } from 'telegram';

// System jildlar (masalan "Barchasi") 0 va 1 id'larni band qiladi — yangi
// jild yaratganda shu ikkitasidan pastroq id hech qachon berilmaydi.
const RESERVED_FILTER_IDS = new Set([0, 1]);

function isDefaultFilter(f) {
  return f.className === 'DialogFilterDefault';
}

function normalizeFilter(f) {
  if (isDefaultFilter(f)) {
    return { id: 0, title: 'Barchasi', emoticon: null, peer_count: 0, isDefault: true, raw: f };
  }
  return {
    id: f.id,
    title: f.title,
    emoticon: f.emoticon || null,
    peer_count: (f.includePeers || []).length,
    isDefault: false,
    raw: f,
  };
}

// Barcha MTProto chaqiruvlari shu faylda markazlashgan — boshqa joyda
// (rules.js, sync.js, folderRoutes.js) to'g'ridan-to'g'ri Api.messages.*
// chaqirilmaydi, faqat shu ko'prik orqali. `client` — src/telegram/client.js
// dagi pool (yoki uning bitta sessiyasi): `.invoke()` har bir chaqiruvni
// rate-limit/FloodWait himoyasidan avtomatik o'tkazadi.
async function fetchRawFilters(client) {
  const result = await client.invoke(new Api.messages.GetDialogFilters({}));
  return result.filters || [];
}

export async function listFolders(client) {
  const raw = await fetchRawFilters(client);
  return raw.map(normalizeFilter);
}

// Sarlavhasi bo'yicha mavjud (tizim jildlaridan tashqari) jildni qidiradi;
// topilmasa, bo'sh eng kichik id (2dan boshlab — 0/1 tizim uchun band)
// bilan yangisini yaratadi.
export async function ensureFolder(client, { title, emoticon } = {}) {
  if (!title?.trim()) {
    throw new Error('Jild nomi (title) majburiy');
  }

  const raw = await fetchRawFilters(client);
  const existing = raw.find((f) => !isDefaultFilter(f) && f.title === title);
  if (existing) {
    return { id: existing.id, created: false, filter: normalizeFilter(existing) };
  }

  const usedIds = new Set(raw.filter((f) => !isDefaultFilter(f)).map((f) => f.id));
  let newId = 2;
  while (usedIds.has(newId) || RESERVED_FILTER_IDS.has(newId)) newId += 1;

  const filter = new Api.DialogFilter({
    id: newId,
    title,
    emoticon: emoticon || undefined,
    pinnedPeers: [],
    includePeers: [],
    excludePeers: [],
  });
  await client.invoke(new Api.messages.UpdateDialogFilter({ id: newId, filter }));
  return { id: newId, created: true, filter: normalizeFilter(filter) };
}

// Jildning a'zolar (includePeers) ro'yxatini almashtiradi. `peerIds` —
// Telegram foydalanuvchi ID'lari massivi (string yoki number); InputPeer'ga
// aylantirish uchun `client.primaryClient.getInputEntity()` ishlatiladi —
// odatda tarmoqqa chiqmasdan sessiya keshidan javob beradi, chunki bu
// foydalanuvchilar avval getDialogs orqali allaqachon ko'rilgan bo'ladi.
//
// DIQQAT: Telegram `messages.updateDialogFilter` butun filter obyektini
// qayta yozadi (faqat includePeers'ni emas) — shuning uchun avval mavjud
// filterni o'qib, includePeers'dan BOSHQA barcha maydonlarini (title,
// emoticon, pinnedPeers, excludePeers, contacts va h.k.) saqlab qolamiz.
export async function setFolderPeers(client, filterId, peerIds) {
  const raw = await fetchRawFilters(client);
  const existing = raw.find((f) => !isDefaultFilter(f) && f.id === filterId);
  if (!existing) {
    throw new Error(`Jild topilmadi (id=${filterId}) — avval ensureFolder() bilan yarating.`);
  }

  const includePeers = [];
  for (const peerId of peerIds) {
    try {
      includePeers.push(await client.primaryClient.getInputEntity(peerId));
    } catch (err) {
      console.warn(`[folders] peer ${peerId} uchun InputPeer topilmadi, o'tkazib yuborildi: ${err.message}`);
    }
  }

  const filter = new Api.DialogFilter({ ...existing, includePeers });
  await client.invoke(new Api.messages.UpdateDialogFilter({ id: filterId, filter }));
  return { id: filterId, peerCount: includePeers.length };
}

export async function deleteFolder(client, filterId) {
  // `filter` maydoni berilmasa (flag ixtiyoriy), Telegram buni jildni
  // o'chirish so'rovi sifatida qabul qiladi.
  await client.invoke(new Api.messages.UpdateDialogFilter({ id: filterId }));
}

export default { listFolders, ensureFolder, setFolderPeers, deleteFolder };
