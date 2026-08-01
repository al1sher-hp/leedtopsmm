import { useCallback, useEffect, useState } from 'react';
import {
  lookupResolve,
  lookupBulkStart,
  fetchLookupJob,
  exportLookupJobXlsxUrl,
  fetchLookupProviders,
  fetchLookupAudit,
} from '../lib/api.js';

const PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto (avval Telegram, keyin bot)' },
  { value: 'gramjs', label: 'Faqat Telegram' },
  { value: 'tgbot', label: 'Faqat tashqi bot' },
];

// HIMOYA #6 (majburiy): natija qaysi manbadan kelgani doim ochiq ko'rsatiladi
// — ikki manba (real Telegram / tashqi snapshot bot) hech qachon bir xil
// ko'rinishda taqdim etilmaydi.
function SourceBadge({ confidence }) {
  if (confidence === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
        ✅ Telegram (tasdiqlangan)
      </span>
    );
  }
  if (confidence === 'unverified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
        ⚠️ Tashqi baza (tasdiqlanmagan)
      </span>
    );
  }
  return null;
}

function BotStatusBanner({ providers }) {
  if (!providers) return null;
  const { bot, dailyCap, usedToday, remainingToday } = providers;

  if (bot?.subscriptionRequired) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
        🔒 Tashqi bot obuna/a'zolikni talab qilmoqda — qo'lda hal qilinmaguncha bot orqali qidiruv ishlamaydi.
      </div>
    );
  }
  if (bot?.quotaExhausted) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
        ⛔ Tashqi botning kunlik limiti/balansi tugagan.
      </div>
    );
  }
  return (
    <div className="bg-gray-50 border border-gray-200 text-gray-500 text-xs rounded-xl px-4 py-2 flex items-center justify-between flex-wrap gap-2">
      <span>
        Kunlik lookup qoldig'i: <strong className="text-gray-700">{remainingToday}/{dailyCap}</strong> ({usedToday} ishlatilgan)
      </span>
      {bot?.lastError && <span className="text-red-500">Oxirgi bot xatosi: {bot.lastError}</span>}
    </div>
  );
}

// ─── Yagona qidiruv ────────────────────────────────────────────────────────
function SingleLookup({ provider }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  async function handleLookup(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await lookupResolve(input.trim(), { purpose: 'dashboard', provider });
      setResult(res.data);
      setHistory((prev) => [{ query: input.trim(), ...res.data }, ...prev.slice(0, 19)]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <form onSubmit={handleLookup} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex gap-3">
        <input
          type="text"
          placeholder="@username yoki username"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Qidirilmoqda…' : 'Topish'}
        </button>
      </form>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">❌ {error}</div>}

      {result && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-gray-800">Natija</h3>
            <SourceBadge confidence={result.confidence} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Username" value={result.username ? `@${result.username}` : '—'} />
            <InfoRow label="User ID" value={result.user_id || '—'} />
            <InfoRow label="Ism" value={[result.first_name, result.last_name].filter(Boolean).join(' ') || '—'} />
            <InfoRow label="Telefon" value={result.phone || 'Yashirilgan/topilmadi'} highlight={!!result.phone} />
            <InfoRow label="Bot" value={result.is_bot ? 'Ha' : "Yo'q"} />
          </div>
          {!result.phone && (
            <p className="text-xs text-gray-400">
              ℹ️ Telefon topilmadi — Telegram maxfiylik sozlamalarida yashirilgan bo'lishi yoki tashqi bazada
              mavjud bo'lmasligi mumkin.
            </p>
          )}
          {result.source_note && <p className="text-xs text-amber-600">⚠️ {result.source_note}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Oxirgi qidiruvlar</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {history.map((h, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between text-sm gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-500 truncate">@{h.username || h.query.replace(/^@/, '')}</span>
                  {h.first_name && <span className="text-gray-700 truncate">{[h.first_name, h.last_name].filter(Boolean).join(' ')}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SourceBadge confidence={h.confidence} />
                  <span className={h.phone ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {h.phone || 'Topilmadi'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ko'plab qidiruv ───────────────────────────────────────────────────────
function BulkLookup({ provider }) {
  const [text, setText] = useState('');
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');

  function parseUsernames(raw) {
    return raw
      .split(/[\n,;\s]+/)
      .map((u) => u.trim().replace(/^@/, ''))
      .filter(Boolean);
  }

  const pollJob = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchLookupJob(jobId);
        setJob(res.data);
        if (res.data.status !== 'running') clearInterval(interval);
      } catch (err) {
        console.error(err);
        clearInterval(interval);
      }
    }, 2000);
  };

  async function handleBulk(e) {
    e.preventDefault();
    const usernames = parseUsernames(text);
    if (usernames.length === 0) return;
    setStarting(true); setError(''); setJob(null);
    try {
      const res = await lookupBulkStart(usernames, { purpose: 'dashboard-bulk', provider });
      setJob({ id: res.job_id, status: 'running', total: usernames.length, done: 0, ok_count: 0 });
      pollJob(res.job_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const results = job?.params_json?.results || [];
  const pct = job?.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <p className="text-sm text-gray-600 mb-3">
          Usernamlarni qatorma-qator, vergul yoki bo'sh joy bilan ajrating. Bir so'rovda 5000 tagacha. Fon
          rejimida ishlaydi (kunlik cap va navbat cheklovlariga bo'ysunadi).
        </p>
        <form onSubmit={handleBulk} className="flex flex-col gap-3">
          <textarea
            placeholder={'@user1\n@user2\nuser3'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{parseUsernames(text).length} ta username</span>
            <button
              type="submit"
              disabled={starting || (job && job.status === 'running') || parseUsernames(text).length === 0}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {starting ? 'Boshlanmoqda…' : 'Barcha nomerlarni topish'}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">❌ {error}</div>}

      {job && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
          {job.status === 'running' ? (
            <>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-500">
                {job.done} / {job.total} ko'rib chiqildi — {job.ok_count} ta topildi
              </span>
            </>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-gray-700">
                {job.status === 'completed' ? 'Tugallandi' : job.status === 'cancelled' ? "To'xtatildi" : 'Xato'}:{' '}
                {job.done} ta ko'rib chiqildi, {job.ok_count} ta topildi
              </span>
              {results.length > 0 && (
                <a
                  href={exportLookupJobXlsxUrl(job.id)}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"
                >
                  ⬇ XLSX yuklab olish
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Username', 'Ism', 'Telefon', 'Manba', 'Holat'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((r, i) => (
                  <tr key={i} className={r.error ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-gray-700">@{r.username || r.query}</td>
                    <td className="px-3 py-2 text-gray-600">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className={`px-3 py-2 font-medium ${r.phone ? 'text-green-700' : 'text-gray-400'}`}>
                      {r.phone || (r.error ? `❌ ${r.error}` : 'Topilmadi')}
                    </td>
                    <td className="px-3 py-2"><SourceBadge confidence={r.confidence} /></td>
                    <td className="px-3 py-2">{r.phone ? '✅' : r.error ? '❌' : '🔒'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Audit — kim, qachon, nima uchun qidirgan ──────────────────────────────
function AuditTab() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ provider: '', actor: '', page: 1 });

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const res = await fetchLookupAudit(f);
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters); }, [filters, load]);

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-2">
        <select
          value={filters.provider}
          onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value, page: 1 }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Provider: hammasi</option>
          <option value="gramjs">gramjs</option>
          <option value="tgbot">tgbot</option>
        </select>
        <input
          type="text"
          placeholder="Actor (masalan api, job:dialogs)"
          value={filters.actor}
          onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value, page: 1 }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm flex-1 min-w-[160px]"
        />
      </div>

      {loading && <div className="text-sm text-gray-400 text-center py-4">yuklanmoqda...</div>}

      {!loading && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Vaqt', 'Query', 'Provider', 'Actor', 'Maqsad', 'Topildi', 'Telefon (niqoblangan)'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-700">{r.query_value}</td>
                    <td className="px-3 py-2 text-gray-600">{r.provider}</td>
                    <td className="px-3 py-2 text-gray-600">{r.actor}</td>
                    <td className="px-3 py-2 text-gray-400">{r.purpose || '—'}</td>
                    <td className="px-3 py-2">{r.found ? '✅' : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono">{r.result_phone_masked || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagination && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            disabled={pagination.page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-40"
          >
            Oldingi
          </button>
          <span className="text-sm text-gray-500">{pagination.page} / {pagination.totalPages || 1}</span>
          <button
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            disabled={pagination.page >= pagination.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-40"
          >
            Keyingi
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function PhoneLookupPage() {
  const [mode, setMode] = useState('single');
  const [provider, setProvider] = useState('auto');
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchLookupProviders()
        .then((res) => { if (!cancelled) setProviders(res); })
        .catch(() => {});
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">📞 Nomer qidirish</h2>
        <p className="text-sm text-gray-500 mt-1">
          @username orqali Telegram raqamini topish. "Auto" avval haqiqiy Telegram'dan (yashirin bo'lmasa),
          topilmasa tashqi bot bazasidan qidiradi — natija manbasi doim ko'rsatiladi.
        </p>
      </div>

      <BotStatusBanner providers={providers} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'single' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Bitta qidiruv
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'bulk' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Ko'plab qidiruv
          </button>
          <button
            onClick={() => setMode('audit')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'audit' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Audit
          </button>
        </div>

        {mode !== 'audit' && (
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {mode === 'single' && <SingleLookup provider={provider} />}
      {mode === 'bulk' && <BulkLookup provider={provider} />}
      {mode === 'audit' && <AuditTab />}
    </div>
  );
}

function InfoRow({ label, value, highlight }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-green-600' : 'text-gray-800'}`}>{value}</div>
    </div>
  );
}
