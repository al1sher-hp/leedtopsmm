import { useState } from 'react';
import { lookupPhone } from '../lib/api.js';

export default function PhoneLookupPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  async function handleLookup(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await lookupPhone(input.trim());
      setResult(res.data);
      setHistory((prev) => [{ query: input.trim(), ...res.data }, ...prev.slice(0, 19)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">📞 Nomer qidirish</h2>
        <p className="text-sm text-gray-500 mt-1">
          @username orqali Telegram raqamini topish. Foydalanuvchi raqamini yashirgan bo'lsa, natija bo'sh keladi.
        </p>
      </div>

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
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Qidirilmoqda…' : 'Topish'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Natija</h3>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Username" value={result.username ? `@${result.username}` : '—'} />
            <InfoRow label="User ID" value={result.user_id || '—'} />
            <InfoRow label="Ism" value={[result.first_name, result.last_name].filter(Boolean).join(' ') || '—'} />
            <InfoRow
              label="Telefon"
              value={result.phone || 'Yashirilgan'}
              highlight={!!result.phone}
            />
            <InfoRow label="Bot" value={result.is_bot ? 'Ha' : 'Yo\'q'} />
          </div>

          {!result.phone && (
            <p className="mt-4 text-xs text-gray-400">
              ℹ️ Bu foydalanuvchi telefon raqamini Telegram maxfiylik sozlamalarida yashirgan.
            </p>
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
                  {h.first_name && (
                    <span className="text-gray-700">{[h.first_name, h.last_name].filter(Boolean).join(' ')}</span>
                  )}
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

function InfoRow({ label, value, highlight }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-green-600' : 'text-gray-800'}`}>
        {value}
      </div>
    </div>
  );
}
