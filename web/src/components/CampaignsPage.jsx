import { useState, useEffect, useCallback } from 'react';
import {
  fetchCampaigns, fetchCampaign, createCampaign, updateCampaign, deleteCampaign,
  startCampaign, pauseCampaign, addTargets, fetchTargets, fetchReplies,
  markReplyRead, respondToReply, triggerInboxCheck, fetchScanSessions,
} from '../lib/api.js';

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-700',
  running:   'bg-green-100 text-green-700',
  paused:    'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-700',
};
const STATUS_LABELS = {
  draft: 'Qoralama', running: 'Ishlayapti', paused: 'To\'xtatilgan', completed: 'Tugallandi',
};
const TARGET_STATUS_COLORS = {
  pending: 'text-gray-500', sent: 'text-green-600', failed: 'text-red-500', replied: 'text-blue-600',
};
const TARGET_STATUS_LABELS = {
  pending: 'Kutmoqda', sent: 'Yuborildi', failed: 'Xato', replied: 'Javob berdi',
};

// ─── Campaign list ────────────────────────────────────────────────────────────
function CampaignList({ onSelect, refresh }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchCampaigns();
      setCampaigns(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [refresh]);

  useEffect(() => { load(); }, [load]);

  return loading ? (
    <div className="text-center py-12 text-gray-400">Yuklanmoqda…</div>
  ) : campaigns.length === 0 ? (
    <div className="text-center py-12 text-gray-400">
      <p className="text-lg mb-2">Kampaniya yo'q</p>
      <p className="text-sm">Yangi kampaniya yarating</p>
    </div>
  ) : (
    <div className="grid gap-3">
      {campaigns.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className="text-left bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 truncate">{c.name}</div>
              <div className="text-xs text-gray-400 mt-0.5 truncate">{c.message_text?.slice(0, 80)}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[c.status]}`}>
              {STATUS_LABELS[c.status]}
            </span>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500">
            <span>📋 {c.total_count} ta</span>
            <span className="text-green-600">✓ {c.sent_count}</span>
            <span className="text-red-500">✗ {c.failed_count}</span>
            <span className="text-blue-600">💬 {c.replied_count}</span>
            {c.ai_auto_reply && <span className="text-purple-600">🤖 AI</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Campaign form ────────────────────────────────────────────────────────────
function CampaignForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || { name: '', message_text: '', message_type: 'text', ai_auto_reply: false, ai_reply_prompt: '' }
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nom majburiy'); return; }
    if (!form.message_text.trim()) { setError('Xabar matni majburiy'); return; }
    setSaving(true);
    try {
      if (initial?.id) {
        await updateCampaign(initial.id, form);
      } else {
        await createCampaign(form);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="font-semibold mb-4">{initial?.id ? 'Kampaniyani tahrirlash' : 'Yangi kampaniya'}</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kampaniya nomi *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Masalan: July outreach — SMM kanal adminlari"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Xabar matni *</label>
          <textarea
            value={form.message_text}
            onChange={(e) => setForm({ ...form, message_text: e.target.value })}
            rows={5}
            placeholder="Salom! Men TopSMM.uz'dan Alisher. Sizning kanalingiz uchun yangi mijozlar topishga yordam bera olamiz..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            id="ai_toggle"
            type="checkbox"
            checked={form.ai_auto_reply}
            onChange={(e) => setForm({ ...form, ai_auto_reply: e.target.checked })}
            className="w-4 h-4 accent-indigo-600"
          />
          <label htmlFor="ai_toggle" className="text-sm font-medium text-gray-700">
            🤖 AI avtomatik javob (Gemini)
          </label>
        </div>
        {form.ai_auto_reply && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">AI javob prompt (ixtiyoriy)</label>
            <textarea
              value={form.ai_reply_prompt}
              onChange={(e) => setForm({ ...form, ai_reply_prompt: e.target.value })}
              rows={3}
              placeholder="Mijoz xabariga qisqacha, do'stona tilda javob ber. TopSMM.uz xizmatlari haqida ma'lumot ber."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '…' : 'Saqlash'}
          </button>
          <button type="button" onClick={onCancel} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm">
            Bekor
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Add targets modal ────────────────────────────────────────────────────────
function AddTargetsModal({ campaignId, onDone, onCancel }) {
  const [mode, setMode] = useState('scan'); // 'scan' | 'manual'
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [excludeBots, setExcludeBots] = useState(true);
  const [manualText, setManualText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchScanSessions().then((r) => setSessions(r.data || [])).catch(() => {});
  }, []);

  async function handleAdd() {
    setError('');
    setLoading(true);
    try {
      let res;
      if (mode === 'scan') {
        if (!selectedSession) { setError('Sessiya tanlang'); setLoading(false); return; }
        res = await addTargets(campaignId, { scan_session_id: parseInt(selectedSession), exclude_bots: excludeBots });
      } else {
        const lines = manualText.split('\n').map((l) => l.trim()).filter(Boolean);
        const contacts = lines.map((l) => ({
          contact_type: l.startsWith('+') || /^\d/.test(l) ? 'phone' : 'username',
          contact_value: l.replace(/^@/, ''),
        }));
        if (contacts.length === 0) { setError('Hech qanday kontakt kiritilmagan'); setLoading(false); return; }
        res = await addTargets(campaignId, { contacts });
      }
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold mb-3 text-green-700">✅ Targetlar qo'shildi</h3>
        <p className="text-sm text-gray-600">Qo'shildi: <strong>{result.added}</strong> ta</p>
        <p className="text-sm text-gray-600">Jami: <strong>{result.total}</strong> ta</p>
        <p className="text-sm text-gray-400">O'tkazib yuborildi (dublikat): {result.skipped}</p>
        <button onClick={onDone} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
          Yopish
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="font-semibold mb-4">Maqsadlar qo'shish</h3>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('scan')}
          className={`text-sm px-3 py-1.5 rounded-lg ${mode === 'scan' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Scan sessiyasidan
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`text-sm px-3 py-1.5 rounded-lg ${mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Qo'lda kiritish
        </button>
      </div>

      {mode === 'scan' ? (
        <div className="flex flex-col gap-3">
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Sessiya tanlang —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.source_title || s.source_username || `#${s.id}`} ({s.found_count} kontakt, {new Date(s.createdAt).toLocaleDateString('uz')})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={excludeBots}
              onChange={(e) => setExcludeBots(e.target.checked)}
              className="accent-indigo-600"
            />
            Botlarni o'tkazib yubor
          </label>
        </div>
      ) : (
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          rows={8}
          placeholder={'Har qatorda bitta username yoki telefon:\n@username1\n@username2\n+998901234567'}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      )}

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleAdd}
          disabled={loading}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {loading ? '…' : 'Qo\'shish'}
        </button>
        <button onClick={onCancel} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm">Bekor</button>
      </div>
    </div>
  );
}

// ─── Campaign detail ──────────────────────────────────────────────────────────
function CampaignDetail({ campaign: initCampaign, onBack, onRefresh }) {
  const [campaign, setCampaign] = useState(initCampaign);
  const [tab, setTab] = useState('overview'); // 'overview' | 'targets' | 'replies'
  const [editing, setEditing] = useState(false);
  const [addingTargets, setAddingTargets] = useState(false);
  const [targets, setTargets] = useState([]);
  const [replies, setReplies] = useState([]);
  const [replyPage, setReplyPage] = useState(1);
  const [replyTotal, setReplyTotal] = useState(0);
  const [replyText, setReplyText] = useState({});
  const [loadingAction, setLoadingAction] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);

  const loadCampaign = useCallback(async () => {
    const res = await fetchCampaign(initCampaign.id);
    setCampaign(res.data);
    setUnreadReplies(res.unreadReplies || 0);
  }, [initCampaign.id]);

  const loadTargets = useCallback(async () => {
    const res = await fetchTargets(initCampaign.id, { limit: 100 });
    setTargets(res.data || []);
  }, [initCampaign.id]);

  const loadReplies = useCallback(async () => {
    const res = await fetchReplies(initCampaign.id, { page: replyPage, limit: 30 });
    setReplies(res.data || []);
    setReplyTotal(res.total || 0);
  }, [initCampaign.id, replyPage]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);
  useEffect(() => { if (tab === 'targets') loadTargets(); }, [tab, loadTargets]);
  useEffect(() => { if (tab === 'replies') loadReplies(); }, [tab, loadReplies]);

  // Auto-refresh every 10s if running
  useEffect(() => {
    if (campaign.status !== 'running') return;
    const iv = setInterval(loadCampaign, 10000);
    return () => clearInterval(iv);
  }, [campaign.status, loadCampaign]);

  async function handleStart() {
    setLoadingAction(true);
    try {
      await startCampaign(campaign.id);
      await loadCampaign();
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setLoadingAction(false); }
  }

  async function handlePause() {
    setLoadingAction(true);
    try {
      await pauseCampaign(campaign.id);
      await loadCampaign();
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setLoadingAction(false); }
  }

  async function handleDelete() {
    if (!confirm('Kampaniyani barcha targetlar va javoblar bilan o\'chirishni tasdiqlaysizmi?')) return;
    try {
      await deleteCampaign(campaign.id);
      onBack();
      onRefresh();
    } catch (err) { alert(err.message); }
  }

  async function handleCheckReplies() {
    try {
      await triggerInboxCheck(campaign.id);
      setTimeout(loadReplies, 5000);
    } catch (err) { alert(err.message); }
  }

  async function handleRespond(reply) {
    const text = replyText[reply.id];
    if (!text?.trim()) return;
    try {
      await respondToReply(campaign.id, reply.id, text);
      setReplyText((t) => ({ ...t, [reply.id]: '' }));
      await loadReplies();
    } catch (err) { alert(err.message); }
  }

  async function handleMarkRead(reply) {
    await markReplyRead(campaign.id, reply.id);
    await loadReplies();
    await loadCampaign();
  }

  const pct = campaign.total_count > 0
    ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_count) * 100)
    : 0;

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => setEditing(false)} className="text-sm text-indigo-600 self-start">← Orqaga</button>
        <CampaignForm
          initial={campaign}
          onSave={async () => { setEditing(false); await loadCampaign(); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="text-indigo-600 text-sm mt-1">← Orqaga</button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-gray-800">{campaign.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[campaign.status]}`}>
              {STATUS_LABELS[campaign.status]}
            </span>
            {campaign.ai_auto_reply && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🤖 AI javob</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {campaign.status !== 'running' && (
            <button onClick={() => setEditing(true)} className="text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
              ✏️ Tahrirlash
            </button>
          )}
          <button onClick={handleDelete} className="text-sm text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
            🗑
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Jami', value: campaign.total_count, color: 'text-gray-700' },
          { label: 'Yuborildi', value: campaign.sent_count, color: 'text-green-600' },
          { label: 'Xato', value: campaign.failed_count, color: 'text-red-500' },
          { label: 'Javob', value: campaign.replied_count, color: 'text-blue-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {campaign.total_count > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span><span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {campaign.status !== 'running' && (
          <button
            onClick={handleStart}
            disabled={loadingAction}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loadingAction ? '…' : '▶ Boshlash'}
          </button>
        )}
        {campaign.status === 'running' && (
          <button
            onClick={handlePause}
            disabled={loadingAction}
            className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
          >
            {loadingAction ? '…' : '⏸ To\'xtatish'}
          </button>
        )}
        <button
          onClick={() => setAddingTargets(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + Maqsadlar qo'shish
        </button>
      </div>

      {/* Add targets */}
      {addingTargets && (
        <AddTargetsModal
          campaignId={campaign.id}
          onDone={async () => { setAddingTargets(false); await loadCampaign(); if (tab === 'targets') loadTargets(); }}
          onCancel={() => setAddingTargets(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-4">
        {[
          { id: 'overview', label: 'Xabar matni' },
          { id: 'targets', label: `Maqsadlar (${campaign.total_count})` },
          { id: 'replies', label: `Javoblar${unreadReplies > 0 ? ` 🔴${unreadReplies}` : ''}` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 text-sm font-medium ${tab === t.id ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Xabar matni:</p>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{campaign.message_text}</pre>
          {campaign.ai_auto_reply && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-purple-700 mb-1">🤖 AI javob prompt:</p>
              <p className="text-sm text-gray-600">{campaign.ai_reply_prompt || '(standart)'}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'targets' && (
        <div>
          {targets.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Target yo'q</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Kontakt</th>
                    <th className="px-4 py-3 text-left">Tur</th>
                    <th className="px-4 py-3 text-left">Holat</th>
                    <th className="px-4 py-3 text-left">Yuborilgan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {targets.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">
                        {t.contact_type === 'username' ? `@${t.contact_value}` : `+${t.contact_value}`}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs capitalize">{t.contact_type}</td>
                      <td className={`px-4 py-2 font-medium text-xs ${TARGET_STATUS_COLORS[t.status]}`}>
                        {TARGET_STATUS_LABELS[t.status]}
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {t.sent_at ? new Date(t.sent_at).toLocaleString('uz') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'replies' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Jami {replyTotal} ta javob</span>
            <button
              onClick={handleCheckReplies}
              className="text-sm text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
            >
              🔄 Yangilarni tekshir
            </button>
          </div>

          {replies.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Hali javob yo'q</div>
          ) : (
            replies.map((r) => (
              <div key={r.id} className={`bg-white border rounded-xl p-4 shadow-sm ${!r.is_read ? 'border-blue-300' : 'border-gray-200'}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {r.from_username ? `@${r.from_username}` : r.from_user_id ? `ID: ${r.from_user_id}` : 'Noma\'lum'}
                    {!r.is_read && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Yangi</span>}
                  </span>
                  <div className="flex gap-2">
                    {!r.is_read && (
                      <button onClick={() => handleMarkRead(r)} className="text-xs text-gray-400 hover:text-gray-600">O'qildi ✓</button>
                    )}
                    {r.replied && <span className="text-xs text-green-600">✓ Javob berildi</span>}
                  </div>
                </div>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 mb-3">{r.message_text}</p>
                <div className="text-xs text-gray-400 mb-3">{new Date(r.received_at).toLocaleString('uz')}</div>

                {r.ai_suggested_reply && (
                  <div className="bg-purple-50 rounded-lg p-3 mb-3 text-sm text-purple-800">
                    <span className="text-xs font-medium text-purple-500 block mb-1">🤖 AI taklif:</span>
                    {r.ai_suggested_reply}
                  </div>
                )}

                {!r.replied && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText[r.id] || ''}
                      onChange={(e) => setReplyText((t) => ({ ...t, [r.id]: e.target.value }))}
                      onFocus={() => !r.is_read && handleMarkRead(r)}
                      placeholder={r.ai_suggested_reply ? 'AI taklifini yuborish yoki o\'z javobingizni yozing…' : 'Javob yozing…'}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    {r.ai_suggested_reply && !replyText[r.id] && (
                      <button
                        onClick={() => setReplyText((t) => ({ ...t, [r.id]: r.ai_suggested_reply }))}
                        className="text-xs text-purple-600 border border-purple-200 px-2 py-1 rounded-lg"
                      >
                        AI dan
                      </button>
                    )}
                    <button
                      onClick={() => handleRespond(r)}
                      disabled={!replyText[r.id]?.trim()}
                      className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50"
                    >
                      Yuborish
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() { setRefreshKey((k) => k + 1); }

  if (selected) {
    return (
      <CampaignDetail
        campaign={selected}
        onBack={() => { setSelected(null); refresh(); }}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Kampaniyalar</h2>
          <p className="text-sm text-gray-500">Telegram outreach kampaniyalarini boshqaring</p>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + Yangi kampaniya
        </button>
      </div>

      {creating && (
        <CampaignForm
          onSave={() => { setCreating(false); refresh(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      <CampaignList key={refreshKey} onSelect={setSelected} refresh={refreshKey} />
    </div>
  );
}
