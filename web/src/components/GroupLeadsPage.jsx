import { useCallback, useEffect, useState } from 'react';
import {
  fetchGroupLeadSources,
  createGroupLeadSource,
  fetchGroupLeads,
  fetchGroupLeadStats,
  syncGroupLeadSources,
  groupLeadsExportUrl,
} from '../lib/api.js';

const KIND_LABELS = {
  channel_posts: 'Kanal postlari',
  channel_comments: 'Kanal kommentlari',
};

function formatPhoneDisplay(e164) {
  const digits = (e164 || '').replace(/\D/g, '');
  if (digits.length !== 12 || !digits.startsWith('998')) return e164;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function GroupLeadsPage() {
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');

  const [newKind, setNewKind] = useState('channel_posts');
  const [newTitle, setNewTitle] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);

  const [syncSecret, setSyncSecret] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const loadAll = useCallback(async (sourceId) => {
    setLoadingLeads(true);
    try {
      const [statsRes, sourcesRes, leadsRes] = await Promise.all([
        fetchGroupLeadStats(),
        fetchGroupLeadSources(),
        fetchGroupLeads(sourceId ? { sourceId } : {}),
      ]);
      setStats(statsRes);
      setSources(sourcesRes.data);
      setLeads(leadsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    loadAll(sourceFilter || undefined);
  }, [loadAll, sourceFilter]);

  const handleAddSource = async (e) => {
    e.preventDefault();
    setAddError(null);
    if (!newUsername.trim()) {
      setAddError('username kiritilishi shart');
      return;
    }
    setAdding(true);
    try {
      await createGroupLeadSource({ kind: newKind, title: newTitle.trim() || null, username: newUsername.trim() });
      setNewTitle('');
      setNewUsername('');
      await loadAll(sourceFilter || undefined);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await syncGroupLeadSources(syncSecret.trim() || undefined);
      setSyncResult(res);
      await loadAll(sourceFilter || undefined);
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="jami raqam" value={stats?.total} color="text-gray-900" />
        <StatCard label="faol manba" value={stats?.activeSources} color="text-indigo-600" />
        <StatCard label="eksportga tayyor" value={stats?.exportable} color="text-emerald-600" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Guruh lead'lar</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ochiq Telegram kanal postlari va (agar izohlar guruhi ochiq bo'lsa) kommentlaridan, odamlar o'zi yozgan
            telefon raqamlarini yig'adi (<code>t.me/s/&lt;username&gt;</code> va{' '}
            <code>t.me/&lt;username&gt;/&lt;id&gt;?embed=1&amp;discussion=1</code> — ikkisi ham ochiq, obuna/login
            talab qilmaydi). Profil maydonidagi raqamlar yig'ilmaydi — faqat xabar matnida ochiq yozilgan raqamlar.
          </p>
        </div>

        <form onSubmit={handleAddSource} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tur</label>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="channel_posts">Kanal postlari</option>
              <option value="channel_comments">Kanal kommentlari</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nomi (ixtiyoriy)</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Elonlar kanali"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 mb-1 block">@username yoki t.me/username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="@elonlar_kanali"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-40"
          >
            {adding ? "Qo'shilmoqda..." : 'Manba qo\'shish'}
          </button>
        </form>
        {addError && <div className="text-xs text-red-600">{addError}</div>}

        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-100">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 mb-1 block">
              Sync kaliti (CRON_SECRET) — faqat shu so'rov uchun yuboriladi, saqlanmaydi
            </label>
            <input
              type="password"
              value={syncSecret}
              onChange={(e) => setSyncSecret(e.target.value)}
              placeholder="•••••••"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap"
          >
            {syncing ? 'Sinxronlanmoqda...' : 'Sinxronlash'}
          </button>
          <a
            href={groupLeadsExportUrl(true)}
            className="text-sm bg-gray-100 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-200 whitespace-nowrap"
          >
            CSV (SHA256)
          </a>
          <a
            href={groupLeadsExportUrl(false)}
            className="text-sm bg-gray-100 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-200 whitespace-nowrap"
          >
            CSV (xom)
          </a>
        </div>
        {syncError && <div className="text-xs text-red-600">Xato: {syncError}</div>}
        {syncResult && (
          <div className="text-xs text-emerald-600">
            {syncResult.synced} ta manba sinxronlandi.{' '}
            {syncResult.results
              .map((r) => (r.error ? `${r.username}: xato — ${r.error}` : `${r.username}: +${r.inserted} yangi`))
              .join('; ')}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Manbalar</h3>
        {sources.length === 0 ? (
          <div className="text-xs text-gray-400">Hozircha manba qo'shilmagan.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3">Nomi</th>
                <th className="py-2 pr-3">Turi</th>
                <th className="py-2 pr-3">Username</th>
                <th className="py-2 pr-3">Lead soni</th>
                <th className="py-2 pr-3">Oxirgi sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className={`cursor-pointer hover:bg-gray-50 ${sourceFilter === String(s.id) ? 'bg-indigo-50' : ''}`}
                  onClick={() => setSourceFilter(sourceFilter === String(s.id) ? '' : String(s.id))}
                >
                  <td className="py-2 pr-3">{s.title || s.username}</td>
                  <td className="py-2 pr-3 text-gray-500">{KIND_LABELS[s.kind] || s.kind}</td>
                  <td className="py-2 pr-3 text-gray-500">@{s.username}</td>
                  <td className="py-2 pr-3">{s.lead_count}</td>
                  <td className="py-2 pr-3 text-gray-400">
                    {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : "hech qachon"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sourceFilter && (
          <button onClick={() => setSourceFilter('')} className="text-xs text-indigo-600 mt-2 hover:text-indigo-800">
            Filtrni tozalash
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Lead'lar</h3>
        {loadingLeads ? (
          <div className="text-xs text-gray-400">yuklanmoqda...</div>
        ) : leads.length === 0 ? (
          <div className="text-xs text-gray-400">Hozircha lead yig'ilmagan.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3">Raqam</th>
                <th className="py-2 pr-3">Kim</th>
                <th className="py-2 pr-3">Manba</th>
                <th className="py-2 pr-3">Kalit so'z</th>
                <th className="py-2 pr-3">Xabar</th>
                <th className="py-2 pr-3">Sana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((l) => (
                <tr key={l.id} className={l.opted_out ? 'opacity-40' : ''}>
                  <td className="py-2 pr-3 font-medium text-gray-900">{formatPhoneDisplay(l.phone_e164)}</td>
                  <td className="py-2 pr-3 text-gray-500">
                    {l.display_name || (l.username ? `@${l.username}` : '—')}
                  </td>
                  <td className="py-2 pr-3 text-gray-500">{l.source_title || l.source_username}</td>
                  <td className="py-2 pr-3 text-gray-500">{l.matched_kw || '—'}</td>
                  <td className="py-2 pr-3">
                    {l.message_url ? (
                      <a href={l.message_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800">
                        ochish
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-400">
                    {(l.posted_at || l.collected_at) ? new Date(l.posted_at || l.collected_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
