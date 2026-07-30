import { useCallback, useEffect, useState } from 'react';
import FolderSidebar from './FolderSidebar.jsx';
import {
  fetchFolders,
  createFolder,
  applyFolderRule,
  fetchFolderJob,
  syncFolder,
  fetchFolderMembers,
  exportFolderXlsxUrl,
  deleteFolderEntry,
} from '../lib/api.js';

const MEMBERS_PAGE_SIZE = 50;

const ORDER_BY_LABELS = {
  premium_mentions: 'Premium eslatishlar soni',
  last_message_at: 'Oxirgi xabar sanasi',
};

function emptyRule() {
  return {
    premium_mentions_gte: '',
    is_premium: '',
    has_phone: '',
    last_message_after: '',
    limit: '',
    order_by: 'premium_mentions',
  };
}

// Formadagi bo'sh matn qiymatlarini backend kutgan tiplarga (raqam/bool/
// undefined) aylantiradi — bo'sh qoldirilgan maydon qoidaga umuman
// qo'shilmaydi (filtr sifatida hisobga olinmaydi).
function ruleToPayload(rule) {
  const payload = { order_by: rule.order_by };
  if (rule.premium_mentions_gte !== '') payload.premium_mentions_gte = Number(rule.premium_mentions_gte);
  if (rule.is_premium !== '') payload.is_premium = rule.is_premium === 'true';
  if (rule.has_phone !== '') payload.has_phone = rule.has_phone === 'true';
  if (rule.last_message_after) payload.last_message_after = new Date(rule.last_message_after).toISOString();
  if (rule.limit !== '') payload.limit = Number(rule.limit);
  return payload;
}

function RuleSummary({ rule }) {
  if (!rule) {
    return <span className="text-xs text-gray-400">Qoida yo'q — a'zolar faqat Telegram'dan sinxronlanadi</span>;
  }
  const parts = [];
  if (rule.premium_mentions_gte != null) parts.push(`premium eslatish >= ${rule.premium_mentions_gte}`);
  if (rule.is_premium != null) parts.push(rule.is_premium ? 'faqat Premium' : 'faqat oddiy');
  if (rule.has_phone != null) parts.push(rule.has_phone ? 'telefon bor' : "telefon yo'q");
  if (rule.last_message_after) parts.push(`oxirgi xabar >= ${new Date(rule.last_message_after).toLocaleDateString()}`);
  if (rule.limit) parts.push(`maksimal ${rule.limit} ta`);
  parts.push(`saralash: ${ORDER_BY_LABELS[rule.order_by] || rule.order_by}`);
  return <span className="text-xs text-gray-500">{parts.join(' · ')}</span>;
}

export default function FoldersPage() {
  const [folders, setFolders] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [listError, setListError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersPage, setMembersPage] = useState(1);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [emoticon, setEmoticon] = useState('');
  const [rule, setRule] = useState(emptyRule());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [applyingId, setApplyingId] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetchFolders();
      setFolders(res.data);
      setLimits(res.limits);
      setListError(null);
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const loadMembers = useCallback(async (id, page = 1) => {
    setLoadingMembers(true);
    try {
      const res = await fetchFolderMembers(id, { page, limit: MEMBERS_PAGE_SIZE });
      setMembers(res.data);
      setMembersTotal(res.total);
      setMembersPage(page);
    } catch (err) {
      console.error(err);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    setApplyResult(null);
    setActionError(null);
    if (selectedId === null) {
      setMembers([]);
      return;
    }
    loadMembers(selectedId, 1);
  }, [selectedId, loadMembers]);

  const selectedFolder = folders.find((f) => f.id === selectedId) || null;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const payload = { title: title.trim(), emoticon: emoticon.trim() || undefined, rule: ruleToPayload(rule) };
      const res = await createFolder(payload);
      setTitle('');
      setEmoticon('');
      setRule(emptyRule());
      setShowCreate(false);
      await loadFolders();
      setSelectedId(res.data.id);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Qo'llash (apply) fon rejimida ishlaydi — pipeline/scan'dagi bilan bir xil
  // "job_id qaytadi, keyin holatini so'rab tur" naqshi.
  const pollJob = (jobId, folderId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchFolderJob(jobId);
        const job = res.data;
        if (job.status !== 'running') {
          clearInterval(interval);
          setApplyingId(null);
          setApplyResult({
            success: job.status === 'completed',
            total: job.total,
            ok_count: job.ok_count,
            overflow_count: job.params_json?.overflow_count || 0,
            error: job.error_message,
          });
          loadFolders();
          if (selectedId === folderId) loadMembers(folderId, 1);
        }
      } catch (err) {
        clearInterval(interval);
        setApplyingId(null);
        console.error(err);
      }
    }, 2000);
  };

  const handleApply = async (id) => {
    setActionError(null);
    setApplyResult(null);
    setApplyingId(id);
    try {
      const res = await applyFolderRule(id);
      pollJob(res.job_id, id);
    } catch (err) {
      setApplyingId(null);
      setActionError(err.message);
    }
  };

  const handleSync = async (id) => {
    setActionError(null);
    setSyncingId(id);
    try {
      await syncFolder(id);
      await loadFolders();
      if (selectedId === id) loadMembers(id, 1);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id) => {
    await deleteFolderEntry(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const sidebarItems = folders.map((f) => ({
    id: f.id,
    label: `${f.emoticon ? `${f.emoticon} ` : ''}${f.title}`,
    badge: {
      text: `${f.peer_count} / ${f.limit}`,
      style: f.truncated
        ? 'bg-red-100 text-red-700'
        : f.peer_count >= f.limit * 0.8
          ? 'bg-amber-100 text-amber-700'
          : 'bg-emerald-100 text-emerald-700',
    },
    meta: f.managed_by_us ? 'Boshqariladi' : "Telegram'dan sinxronlangan",
    errorText: f.truncated ? `${f.overflow_count} ta kontakt jildga sig'madi` : null,
    downloadUrl: f.peer_count > 0 ? exportFolderXlsxUrl(f.id) : null,
  }));

  const totalMemberPages = Math.ceil(membersTotal / MEMBERS_PAGE_SIZE);

  return (
    // 1fr/kontent/1fr — kontent HAR DOIM sahifa markazida qat'iy joylashadi,
    // ChannelScanPage'dagi bilan bir xil layout.
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,64rem)_1fr] gap-4">
      <div className="hidden lg:block" aria-hidden="true" />
      <div className="min-w-0 flex flex-col gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Telegram jildlari</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Premium mijozlarni qoida bo'yicha ajratib, Telegram jildiga (Dialog Filter) joylash.
                {limits && ` Joriy akkaunt limiti: ${limits.maxFolders} ta jild, jildda ${limits.maxPeersPerFolder} ta chat.`}
              </p>
            </div>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 whitespace-nowrap"
            >
              {showCreate ? 'Yopish' : '+ Yangi jild'}
            </button>
          </div>

          {showCreate && (
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Jild nomi</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Premium mijozlar"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Emoji</label>
                  <input
                    type="text"
                    value={emoticon}
                    onChange={(e) => setEmoticon(e.target.value)}
                    placeholder="💎"
                    maxLength={4}
                    className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Qoida — kimlar avtomatik shu jildga joylanishini belgilaydi ("Qo'llash" tugmasi bosilganda qayta
                hisoblanadi). Bo'sh qoldirilgan maydon filtr sifatida hisobga olinmaydi.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Premium eslatish &gt;=</label>
                  <input
                    type="number"
                    min={0}
                    value={rule.premium_mentions_gte}
                    onChange={(e) => setRule((r) => ({ ...r, premium_mentions_gte: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Premium holati</label>
                  <select
                    value={rule.is_premium}
                    onChange={(e) => setRule((r) => ({ ...r, is_premium: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Hammasi</option>
                    <option value="true">Faqat Premium</option>
                    <option value="false">Faqat oddiy</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Telefon</label>
                  <select
                    value={rule.has_phone}
                    onChange={(e) => setRule((r) => ({ ...r, has_phone: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Farqi yo'q</option>
                    <option value="true">Bor</option>
                    <option value="false">Yo'q</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Oxirgi xabar (dan)</label>
                  <input
                    type="datetime-local"
                    value={rule.last_message_after}
                    onChange={(e) => setRule((r) => ({ ...r, last_message_after: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Maksimal soni</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="masalan 500"
                    value={rule.limit}
                    onChange={(e) => setRule((r) => ({ ...r, limit: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Saralash</label>
                  <select
                    value={rule.order_by}
                    onChange={(e) => setRule((r) => ({ ...r, order_by: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="premium_mentions">Premium eslatishlar soni</option>
                    <option value="last_message_at">Oxirgi xabar sanasi</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCreate}
                  disabled={creating || !title.trim()}
                  className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Yaratilmoqda...' : 'Jild yaratish'}
                </button>
                {createError && <span className="text-xs text-red-600">{createError}</span>}
              </div>
            </div>
          )}

          {listError && <div className="text-xs text-red-600">{listError}</div>}
        </div>

        {selectedFolder ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  {selectedFolder.emoticon ? `${selectedFolder.emoticon} ` : ''}
                  {selectedFolder.title}
                </h3>
                <RuleSummary rule={selectedFolder.rule_json} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedFolder.rule_json && (
                  <button
                    onClick={() => handleApply(selectedFolder.id)}
                    disabled={applyingId === selectedFolder.id}
                    className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {applyingId === selectedFolder.id ? "Qo'llanmoqda..." : "Qo'llash"}
                  </button>
                )}
                <button
                  onClick={() => handleSync(selectedFolder.id)}
                  disabled={syncingId === selectedFolder.id}
                  className="text-sm bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-200 disabled:opacity-50"
                >
                  {syncingId === selectedFolder.id ? 'Sinxronlanmoqda...' : 'Sinxronlash'}
                </button>
                {selectedFolder.peer_count > 0 && (
                  <a
                    href={exportFolderXlsxUrl(selectedFolder.id)}
                    className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
                  >
                    Eksport
                  </a>
                )}
              </div>
            </div>

            {selectedFolder.truncated && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                {selectedFolder.overflow_count} ta kontakt jildga sig'madi — to'liq ro'yxat CRM'da, eksport orqali
                oling.
              </div>
            )}

            {applyResult && (
              <div
                className={`text-xs rounded-lg px-3 py-2 border ${
                  applyResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {applyResult.success
                  ? `Qo'llandi: ${applyResult.total} ta mos topildi, ${applyResult.ok_count} tasi jildga joylandi${
                      applyResult.overflow_count > 0 ? `, ${applyResult.overflow_count} tasi sig'madi` : ''
                    }.`
                  : `Xato: ${applyResult.error}`}
              </div>
            )}

            {actionError && <div className="text-xs text-red-600">{actionError}</div>}

            <div className="text-xs text-gray-400">
              {membersTotal} ta a'zo{selectedFolder.limit ? ` (limit: ${selectedFolder.limit})` : ''}
            </div>

            {loadingMembers ? (
              <div className="text-sm text-gray-400">yuklanmoqda...</div>
            ) : members.length === 0 ? (
              <div className="text-sm text-gray-400">Bu jildda hali a'zo yo'q.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="py-1.5 pr-3">Ism</th>
                      <th className="py-1.5 pr-3">Username</th>
                      <th className="py-1.5 pr-3">Telefon</th>
                      <th className="py-1.5 pr-3">Premium</th>
                      <th className="py-1.5 pr-3">Premium eslatish</th>
                      <th className="py-1.5 pr-3">Oxirgi xabar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td className="py-1.5 pr-3 text-gray-700">
                          {[m.contact?.first_name, m.contact?.last_name].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-500">
                          {m.contact?.username ? `@${m.contact.username}` : '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-500">{m.contact?.phone || '—'}</td>
                        <td className="py-1.5 pr-3">{m.contact?.is_premium ? '⭐' : ''}</td>
                        <td className="py-1.5 pr-3 text-gray-500">{m.contact?.premium_mentions ?? 0}</td>
                        <td className="py-1.5 pr-3 text-gray-400">
                          {m.contact?.last_message_at ? new Date(m.contact.last_message_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalMemberPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => loadMembers(selectedFolder.id, membersPage - 1)}
                  disabled={membersPage <= 1}
                  className="text-xs text-gray-500 disabled:opacity-30"
                >
                  Oldingi
                </button>
                <span className="text-xs text-gray-400">
                  {membersPage} / {totalMemberPages}
                </span>
                <button
                  onClick={() => loadMembers(selectedFolder.id, membersPage + 1)}
                  disabled={membersPage >= totalMemberPages}
                  className="text-xs text-gray-500 disabled:opacity-30"
                >
                  Keyingi
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-400">
            O'ngdagi ro'yxatdan bir jildni tanlang, yoki yangi jild yarating.
          </div>
        )}
      </div>

      <FolderSidebar
        title="Jildlar"
        items={sidebarItems}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDelete={handleDelete}
        loading={loadingFolders}
        emptyText="Hozircha jild yo'q."
        deleteWarning="Faqat tizim tomonidan yaratilgan jildlar o'chiriladi."
      />
    </div>
  );
}
