import { useState } from 'react';
import { lookupPhone, lookupPhoneBulk } from '../lib/api.js';

// ─── Yagona qidiruv ────────────────────────────────────────────────────────
function SingleLookup() {
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
      const res = await lookupPhone(input.trim());
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
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Natija</h3>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Username" value={result.username ? `@${result.username}` : '—'} />
            <InfoRow label="User ID"  value={result.user_id || '—'} />
            <InfoRow label="Ism"      value={[result.first_name, result.last_name].filter(Boolean).join(' ') || '—'} />
            <InfoRow label="Telefon"  value={result.phone || 'Yashirilgan'} highlight={!!result.phone} />
            <InfoRow label="Bot"      value={result.is_bot ? 'Ha' : "Yo'q"} />
          </div>
          {!result.phone && (
            <p className="mt-4 text-xs text-gray-400">ℹ️ Foydalanuvchi raqamini Telegram maxfiylik sozlamalarida yashirgan.</p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Oxirgi qidiruvlar</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {history.map((h, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">@{h.username || h.query.replace(/^@/, '')}</span>
                  {h.first_name && <span className="text-gray-700">{[h.first_name, h.last_name].filter(Boolean).join(' ')}</span>}
                </div>
                <span className={h.phone ? 'text-green-600 font-medium' : 'text-gray-400'}>
                  {h.phone || 'Yashirilgan'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ko'plab qidiruv ───────────────────────────────────────────────────────
function BulkLookup() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  function parseUsernames(raw) {
    return raw
      .split(/[\n,;\s]+/)
      .map((u) => u.trim().replace(/^@/, ''))
      .filter(Boolean);
  }

  async function handleBulk(e) {
    e.preventDefault();
    const usernames = parseUsernames(text);
    if (usernames.length === 0) return;
    setLoading(true); setError(''); setResults(null);
    setProgress(`${usernames.length} ta username yuborilmoqda…`);
    try {
      const res = await lookupPhoneBulk(usernames);
      setResults(res.data);
      setProgress('');
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!results) return;
    const header = 'username,user_id,first_name,last_name,phone,is_bot,error';
    const rows = results.map((r) =>
      [r.username, r.user_id, r.first_name, r.last_name, r.phone, r.is_bot, r.error || '']
        .map((v) => `"${(v || '').toString().replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `phone_lookup_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const found = results?.filter((r) => r.phone).length || 0;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <p className="text-sm text-gray-600 mb-3">
          Usernamlarni qatorma-qator, vergul yoki bo'sh joy bilan ajrating. Bir so'rovda 5000 tagacha.
        </p>
        <form onSubmit={handleBulk} className="flex flex-col gap-3">
          <textarea
            placeholder={"@user1\n@user2\nuser3"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{parseUsernames(text).length} ta username</span>
            <button
              type="submit"
              disabled={loading || parseUsernames(text).length === 0}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Qidirilmoqda…' : 'Barcha nomerlarni topish'}
            </button>
          </div>
        </form>
        {progress && <p className="text-xs text-indigo-600 mt-2">⏳ {progress}</p>}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">❌ {error}</div>}

      {results && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <span className="font-semibold text-gray-800 text-sm">{results.length} ta natija</span>
              <span className="ml-2 text-xs text-green-600">{found} ta nomer topildi</span>
            </div>
            <button
              onClick={downloadCSV}
              className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"
            >
              ⬇ CSV yuklab olish
            </button>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Username','Ism','Telefon','User ID','Holat'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((r, i) => (
                  <tr key={i} className={r.error ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-gray-700">@{r.username}</td>
                    <td className="px-3 py-2 text-gray-600">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className={`px-3 py-2 font-medium ${r.phone ? 'text-green-700' : 'text-gray-400'}`}>
                      {r.phone || (r.error ? `❌ ${r.error}` : 'Yashirilgan')}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{r.user_id || '—'}</td>
                    <td className="px-3 py-2">
                      {r.phone ? '✅' : r.error ? '❌' : '🔒'}
                    </td>
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

// ─── Main page ─────────────────────────────────────────────────────────────
export default function PhoneLookupPage() {
  const [mode, setMode] = useState('single');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">📞 Nomer qidirish</h2>
        <p className="text-sm text-gray-500 mt-1">
          @username orqali Telegram raqamini topish. Maxfiylik sozlamalari yopiq bo'lsa raqam ko'rinmaydi.
        </p>
      </div>

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
      </div>

      {mode === 'single' ? <SingleLookup /> : <BulkLookup />}
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
