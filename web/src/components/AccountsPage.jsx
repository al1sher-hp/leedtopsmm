import { useState, useEffect, useCallback } from 'react';
import {
  fetchAccounts, addAccount, verifyAccount, updateAccount, deleteAccount,
} from '../lib/api.js';

const STATUS_COLORS = {
  active:      'bg-green-100 text-green-800',
  banned:      'bg-red-100 text-red-800',
  limited:     'bg-yellow-100 text-yellow-800',
  unverified:  'bg-gray-100 text-gray-700',
};

const STATUS_LABELS = {
  active: 'Aktiv', banned: 'Bloklangan', limited: 'Limit', unverified: 'Tekshirilmagan',
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [form, setForm] = useState({ phone: '', session_string: '', label: '', daily_limit: 40 });
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetchAccounts();
      setAccounts(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');
    if (!form.session_string.trim()) { setFormError('Session string majburiy'); return; }
    try {
      await addAccount(form);
      setForm({ phone: '', session_string: '', label: '', daily_limit: 40 });
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleVerify(id) {
    setVerifying(id);
    try {
      const res = await verifyAccount(id);
      if (res.ok) {
        alert(`✅ Tasdiqlandi: @${res.user?.username || ''} (+${res.user?.phone || ''})`);
      } else {
        alert(`❌ Xato: ${res.error}`);
      }
    } catch (err) {
      alert(`❌ ${err.message}`);
    } finally {
      setVerifying(null);
      load();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Akkountni o\'chirishni tasdiqlaysizmi?')) return;
    try {
      await deleteAccount(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleStatusToggle(acc) {
    const next = acc.status === 'active' ? 'limited' : 'active';
    try {
      await updateAccount(acc.id, { status: next });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Telegram Akkountlar</h2>
          <p className="text-sm text-gray-500">Outreach uchun ishlatiladigan userbot akkauntlari</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + Akkount qo'shish
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold mb-4">Yangi akkount</h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Telefon (ixtiyoriy)</label>
                <input
                  type="text"
                  placeholder="+998901234567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nomi (ixtiyoriy)</label>
                <input
                  type="text"
                  placeholder="Masalan: Bot akk 1"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Session String <span className="text-red-500">*</span></label>
              <textarea
                placeholder="1BVtsOH8... (npm run login orqali olinadi)"
                value={form.session_string}
                onChange={(e) => setForm({ ...form, session_string: e.target.value })}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kunlik limit (xabarlar soni)</label>
              <input
                type="number"
                min={1}
                max={200}
                value={form.daily_limit}
                onChange={(e) => setForm({ ...form, daily_limit: parseInt(e.target.value) || 40 })}
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
                Saqlash
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(''); }}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm"
              >
                Bekor
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Yuklanmoqda…</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">Akkount yo'q</p>
          <p className="text-sm">Outreach uchun kamida bitta Telegram akkaunt kerak</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg shrink-0">
                {(acc.label || acc.phone || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 truncate">{acc.label || acc.phone || `Akkount #${acc.id}`}</div>
                {acc.phone && acc.label && <div className="text-xs text-gray-500">{acc.phone}</div>}
                <div className="text-xs text-gray-400 mt-0.5">
                  Bugun: {acc.messages_today}/{acc.daily_limit} xabar
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[acc.status]}`}>
                  {STATUS_LABELS[acc.status]}
                </span>
                <button
                  onClick={() => handleVerify(acc.id)}
                  disabled={verifying === acc.id}
                  className="text-xs text-indigo-600 border border-indigo-200 px-2 py-1 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                >
                  {verifying === acc.id ? '…' : 'Verify'}
                </button>
                {acc.status !== 'banned' && (
                  <button
                    onClick={() => handleStatusToggle(acc)}
                    className="text-xs text-gray-600 border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-50"
                  >
                    {acc.status === 'active' ? 'Chekla' : 'Aktivlashtir'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(acc.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <strong>Session string olish:</strong> Loyiha papkasida <code className="bg-blue-100 px-1 rounded">npm run login</code> buyrug'ini ishga tushiring, chiqqan sessiya qatorini bu yerga yapishtirib qo'shing.
      </div>
    </div>
  );
}
