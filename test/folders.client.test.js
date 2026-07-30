import { describe, it, expect, vi } from 'vitest';
import { Api } from 'telegram';
import { listFolders, ensureFolder, setFolderPeers, deleteFolder } from '../src/folders/client.js';

// GramJS'ni haqiqiy tarmoqqa ulanmasdan sinash uchun sodda mock client:
// `.invoke()` so'rov turiga qarab qo'lda tayyorlangan javob qaytaradi,
// `.primaryClient.getInputEntity()` esa foydalanuvchi ID'ni InputPeerUser'ga
// aylantiradi (haqiqiy sessiya keshini simulyatsiya qiladi).
function makeMockClient(filters, { getInputEntity } = {}) {
  const invoke = vi.fn(async (request) => {
    if (request.className === 'messages.GetDialogFilters') {
      return { filters };
    }
    if (request.className === 'messages.UpdateDialogFilter') {
      return true;
    }
    throw new Error(`kutilmagan so'rov: ${request.className}`);
  });

  const primaryClient = {
    getInputEntity: getInputEntity || (async (id) => new Api.InputPeerUser({ userId: BigInt(id), accessHash: 0n })),
  };

  return { invoke, primaryClient };
}

function makeDefaultFilter() {
  return new Api.DialogFilterDefault({});
}

function makeFilter({ id, title, emoticon, includePeers = [], pinnedPeers = [], excludePeers = [], contacts = false }) {
  return new Api.DialogFilter({ id, title, emoticon, pinnedPeers, includePeers, excludePeers, contacts });
}

describe('listFolders', () => {
  it("system \"Barchasi\" jildini isDefault=true bilan normallashtiradi", async () => {
    const client = makeMockClient([makeDefaultFilter(), makeFilter({ id: 2, title: 'Premium' })]);
    const folders = await listFolders(client);
    expect(folders).toHaveLength(2);
    expect(folders[0]).toMatchObject({ id: 0, isDefault: true });
    expect(folders[1]).toMatchObject({ id: 2, title: 'Premium', isDefault: false, peer_count: 0 });
  });

  it("peer_count includePeers uzunligidan hisoblanadi", async () => {
    const client = makeMockClient([makeFilter({ id: 2, title: 'Premium', includePeers: [1, 2, 3] })]);
    const folders = await listFolders(client);
    expect(folders[0].peer_count).toBe(3);
  });
});

describe('ensureFolder', () => {
  it('mavjud jildni sarlavha bo\'yicha topadi (yangi yaratmaydi)', async () => {
    const client = makeMockClient([
      makeDefaultFilter(),
      makeFilter({ id: 5, title: 'Premium mijozlar' }),
    ]);

    const result = await ensureFolder(client, { title: 'Premium mijozlar' });

    expect(result).toMatchObject({ id: 5, created: false });
    // Faqat GetDialogFilters chaqirilgan — UpdateDialogFilter (yaratish) YO'Q
    expect(client.invoke).toHaveBeenCalledTimes(1);
    expect(client.invoke.mock.calls[0][0].className).toBe('messages.GetDialogFilters');
  });

  it("mos jild bo'lmasa, bo'sh eng kichik id (2dan boshlab) bilan yangisini yaratadi", async () => {
    const client = makeMockClient([makeDefaultFilter(), makeFilter({ id: 2, title: 'Boshqa jild' })]);

    const result = await ensureFolder(client, { title: 'Premium mijozlar', emoticon: '💎' });

    expect(result.created).toBe(true);
    expect(result.id).toBe(3); // 0/1 band, 2 band -> keyingi bo'sh 3

    const updateCall = client.invoke.mock.calls.find((c) => c[0].className === 'messages.UpdateDialogFilter');
    expect(updateCall).toBeTruthy();
    expect(updateCall[0].id).toBe(3);
    expect(updateCall[0].filter.title).toBe('Premium mijozlar');
    expect(updateCall[0].filter.emoticon).toBe('💎');
  });

  it("bo'sh Telegram akkaunt uchun birinchi jild id=2 bilan yaratiladi", async () => {
    const client = makeMockClient([makeDefaultFilter()]);
    const result = await ensureFolder(client, { title: 'Yangi jild' });
    expect(result.id).toBe(2);
  });

  it('title bo\'sh bo\'lsa xato tashlaydi (Telegram\'ga chaqiruv qilinmaydi)', async () => {
    const client = makeMockClient([makeDefaultFilter()]);
    await expect(ensureFolder(client, { title: '  ' })).rejects.toThrow(/majburiy/);
    expect(client.invoke).not.toHaveBeenCalled();
  });
});

describe('setFolderPeers', () => {
  it("faqat includePeers'ni almashtiradi, boshqa maydonlarni (title/emoticon/pinnedPeers/contacts) buzmaydi", async () => {
    const pinned = [new Api.PeerUser({ userId: 999n })];
    const existing = makeFilter({
      id: 7,
      title: 'Premium mijozlar',
      emoticon: '🔥',
      pinnedPeers: pinned,
      excludePeers: [],
      includePeers: [new Api.PeerUser({ userId: 111n })],
      contacts: true,
    });
    const client = makeMockClient([existing]);

    const result = await setFolderPeers(client, 7, ['111', '222', '333']);

    expect(result).toEqual({ id: 7, peerCount: 3 });

    const updateCall = client.invoke.mock.calls.find((c) => c[0].className === 'messages.UpdateDialogFilter');
    const sentFilter = updateCall[0].filter;
    expect(sentFilter.title).toBe('Premium mijozlar');
    expect(sentFilter.emoticon).toBe('🔥');
    expect(sentFilter.contacts).toBe(true);
    expect(sentFilter.pinnedPeers).toBe(pinned);
    expect(sentFilter.includePeers).toHaveLength(3);
    expect(sentFilter.includePeers[0]).toBeInstanceOf(Api.InputPeerUser);
    expect(sentFilter.includePeers[0].userId).toBe(111n);
  });

  it("Telegram'da topilmagan peer'larni jimgina o'tkazib yuboradi (butun so'rovni to'xtatmaydi)", async () => {
    const existing = makeFilter({ id: 7, title: 'X', includePeers: [] });
    const client = makeMockClient([existing], {
      getInputEntity: vi.fn(async (id) => {
        if (id === 'bad') throw new Error('topilmadi');
        return new Api.InputPeerUser({ userId: BigInt(id), accessHash: 0n });
      }),
    });

    const result = await setFolderPeers(client, 7, ['111', 'bad', '222']);
    expect(result.peerCount).toBe(2);
  });

  it("mavjud bo'lmagan filterId uchun xato tashlaydi", async () => {
    const client = makeMockClient([makeDefaultFilter()]);
    await expect(setFolderPeers(client, 42, ['1'])).rejects.toThrow(/topilmadi/);
  });
});

describe('deleteFolder', () => {
  it('filter maydonisiz UpdateDialogFilter yuboradi (Telegram buni o\'chirish sifatida qabul qiladi)', async () => {
    const client = makeMockClient([]);
    await deleteFolder(client, 9);
    expect(client.invoke).toHaveBeenCalledTimes(1);
    const req = client.invoke.mock.calls[0][0];
    expect(req.className).toBe('messages.UpdateDialogFilter');
    expect(req.id).toBe(9);
    expect(req.filter).toBeUndefined();
  });
});
