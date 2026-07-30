import { useCallback, useEffect, useState } from 'react';
import Pagination from './Pagination.jsx';
import {
  fetchDialogs,
  updateDialogOptedOut,
  exportDialogsXlsxUrl,
  runDialogsSync,
  cancelDialogsSync,
  fetchDialogsSyncStatus,
  fetchFolders,
} from '../lib/api.js';

const DEFAULT_FILTERS = {
  q: '',
  has_phone: '',
  is_premium: '',
  is_bot: '',
  opted_out: 'false',
  premium_mentions_gte: '',
  folder: '',
  sort: 'premium_mentions desc',
  page: 1,
  limit: 20,
};

function phoneSourceBadge(contact) {
  if (!contact.phone) return <span className="text-gray-300">—</span>;
  if (contact.phone_source === 'telegram') {
    return <span title="Telegram'dan olingan">✅ {contact.phone}</span>;
  }
  return <span title="Tashqi baza orqali topilgan">⚠️ {contact.phone}</span>;
}

// Filters.jsx Lead'larga xos (segment/status/lang) maydonlarga qattiq
// bog'langani uchun to'g'ridan-to'g'ri qayta ishlatib bo'lmaydi — shu sababli
// xuddi shu vizual/interaktiv naqsh (input+grid+checkbox, `set(key,value)`)
// bilan dialoglarga mos alohida filtr paneli.
function DialogFilters({ filters, onChange, folders }) {
  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 });

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Qidirish: ism, familiya yoki username"
        value={filters.q}
        onChange={(e) => set('q', e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select
          value={filters.has_phone}
          onChange={(e) => set('has_phone', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Telefon: hammasi</option>
          <option value="true">Telefonli</option>
          <option value="false">Telefonsiz</option>
        </select>

        <select
          value={filters.is_premium}
          onChange={(e) => set('is_premium', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Premium: hammasi</option>
          <option value="true">Faqat Premium</option>
          <option value="false">Faqat oddiy</option>
        </select>

        <select
          value={filters.is_bot}
          onChange={(e) => set('is_bot', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Bot: hammasi</option>
          <option value="true">Faqat botlar</option>
          <option value="false">Botlarsiz</option>
        </select>

        <select
          value={filters.folder}
          onChange={(e) => set('folder', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Jild: hammasi</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Premium eslatish &gt;=</label>
          <input
            type="number"
            min={0}
            value={filters.premium_mentions_gte}
            onChange={(e) => set('premium_mentions_gte', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Saralash</label>
          <select
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="premium_mentions desc">Premium eslatish (ko'pdan kamga)</option>
            <option value="last_message_at desc">Oxirgi xabar (yangidan eskiga)</option>
            <option value="createdAt desc">Qo'shilgan (yangidan eskiga)</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={filters.opted_out === 'true'}
          onChange={(e) => set('opted_out', e.target.checked ? 'true' : 'false')}
          className="rounded border-gray-300"
        />
        Faqat "chiqarilgan" (opted_out) kontaktlarni ko'rsatish
      </label>
    </div>
  );
}

export default function DialogsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [contacts, setContacts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [folders, setFolders] = useState([]);

  const [syncing, setSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const loadContacts = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDialogs(f);
      setContacts(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadContacts(filters), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    fetchFolders()
      .then((res) => setFolders(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchDialogsSyncStatus()
      .then((res) => {
        setSyncJob(res.data);
        setSyncing(res.running);
        if (res.running) pollSyncStatus();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollSyncStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchDialogsSyncStatus();
        setSyncJob(res.data);
        if (!res.running) {
          setSyncing(false);
          clearInterval(interval);
          loadContacts(filters);
        }
      } catch (err) {
        console.error(err);
        clearInterval(interval);
        setSyncing(false);
      }
    }, 2000);
  };

  const handleSync = async () => {
    setSyncError(null);
    try {
      await runDialogsSync({});
      setSyncing(true);
      pollSyncStatus();
    } catch (err) {
      setSyncError(err.message);
    }
  };

  const handleCancelSync = async () => {
    setSyncError(null);
    try {
      await cancelDialogsSync();
    } catch (err) {
      setSyncError(err.message);
    }
  };

  const handleToggleOptedOut = async (contact) => {
    const nextValue = !contact.opted_out;
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, opted_out: nextValue } : c)));
    try {
      await updateDialogOptedOut(contact.id, nextValue);
    } catch (err) {
      setError(err.message);
      loadContacts(filters);
    }
  };

  const exportUrl = exportDialogsXlsxUrl(filters);

  const progressPct = syncJob && syncJob.total > 0 ? Math.round((syncJob.done / syncJob.total) * 100) : 0;

  return (
    <div className="min-w-0 flex flex-col gap-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Lichka kontaktlari</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Userbot'ning shaxsiy dialoglaridan yig'ilgan kontaktlar — reklama ko'rsatish uchun CRM.
            </p>
          </div>
          {!syncing ? (
            <button
              onClick={handleSync}
              className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 whitespace-nowrap"
            >
              Sinxronlash
            </button>
          ) : (
            <button
              onClick={handleCancelSync}
              className="text-sm bg-red-600 text-white rounded-lg px-3 py-1.5 hover:bg-red-700 whitespace-nowrap"
            >
              To'xtatish
            </button>
          )}
        </div>

        {(syncing || syncJob?.status === 'running') && (
          <div className="flex flex-col gap-1">
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {syncJob?.done ?? 0} / {syncJob?.total ?? '?'} dialog ko'rib chiqildi
              {syncJob?.ok_count != null ? ` — ${syncJob.ok_count} ta yozildi` : ''}
            </span>
          </div>
        )}

        {!syncing && syncJob && syncJob.status !== 'running' && (
          <div
            className={`text-xs ${
              syncJob.status === 'failed'
                ? 'text-red-600'
                : syncJob.status === 'cancelled'
                  ? 'text-gray-400'
                  : 'text-emerald-600'
            }`}
          >
            {syncJob.status === 'completed' &&
              `Oxirgi sinxronizatsiya: ${syncJob.done} ta dialog ko'rib chiqildi, ${syncJob.ok_count} ta yozildi.`}
            {syncJob.status === 'cancelled' && "Oxirgi sinxronizatsiya to'xtatilgan."}
            {syncJob.status === 'failed' && `Oxirgi sinxronizatsiya xatosi: ${syncJob.error_message}`}
          </div>
        )}

        {syncError && <div className="text-xs text-red-600">{syncError}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <DialogFilters filters={filters} onChange={setFilters} folders={folders} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-gray-500">{pagination ? `${pagination.total} ta natija` : ''}</span>
        <a
          href={exportUrl}
          className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
        >
          XLSX eksport
        </a>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>}
      {loading && <div className="text-sm text-gray-400 text-center py-4">yuklanmoqda...</div>}

      {!loading && contacts.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-8">Hech qanday kontakt topilmadi</div>
      )}

      {!loading && contacts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Ism</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Telefon</th>
                <th className="px-4 py-3">Premium</th>
                <th className="px-4 py-3">Oxirgi xabar</th>
                <th className="px-4 py-3">Premium eslatishlari</th>
                <th className="px-4 py-3">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                    </div>
                    {c.is_bot && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800">
                        bot
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.username ? `@${c.username}` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{phoneSourceBadge(c)}</td>
                  <td className="px-4 py-3">{c.is_premium ? '⭐' : ''}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.premium_mentions}</td>
                  <td className="px-4 py-3">
                    {c.opted_out ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Chiqarilgan
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggleOptedOut(c)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Chiqarish
                      </button>
                    )}
                    {c.opted_out && (
                      <button
                        onClick={() => handleToggleOptedOut(c)}
                        className="ml-2 text-xs text-indigo-500 hover:text-indigo-700"
                      >
                        Qaytarish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination pagination={pagination} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </div>
  );
}
