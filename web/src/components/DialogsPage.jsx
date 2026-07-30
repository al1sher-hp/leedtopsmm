import { useCallback, useEffect, useState } from 'react';
import Pagination from './Pagination.jsx';
import {
  fetchDialogs,
  updateDialogOptedOut,
  exportDialogsXlsxUrl,
  runDialogsSync,
  cancelDialogsSync,
  fetchDialogsSyncStatus,
  runDialogsClassify,
  cancelDialogsClassify,
  fetchDialogsClassifyStatus,
  fetchFolders,
  applyFolderRule,
  fetchFolderJob,
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

const PREMIUM_CANDIDATE_THRESHOLD = '3';

function phoneSourceBadge(contact) {
  if (!contact.phone) return <span className="text-gray-300">—</span>;
  if (contact.phone_source === 'telegram') {
    return <span title="Telegram'dan olingan">✅ {contact.phone}</span>;
  }
  return <span title="Tashqi baza orqali topilgan">⚠️ {contact.phone}</span>;
}

function formatEta(seconds) {
  if (seconds == null) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '1 daqiqadan kam';
  if (mins < 60) return `~${mins} daqiqa qoldi`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `~${hours} soat ${rem} daqiqa qoldi`;
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

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.premium_mentions_gte === PREMIUM_CANDIDATE_THRESHOLD}
            onChange={(e) => set('premium_mentions_gte', e.target.checked ? PREMIUM_CANDIDATE_THRESHOLD : '')}
            className="rounded border-gray-300"
          />
          Faqat premium nomzodlar (eslatish &gt;= 3)
        </label>

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
    </div>
  );
}

// "Tahlil qilish" sozlamalari — threshold slayder (1-10) va AI tekshiruv
// checkbox'i shu modalda.
function ClassifySettingsModal({ threshold, onThresholdChange, aiVerify, onAiVerifyChange, onStart, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-20 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg p-5 w-full max-w-sm flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-700">Tahlil sozlamalari</h3>
        <p className="text-xs text-gray-500">
          Har bir kontaktning so'nggi xabarlari o'qilib, premium'ga oid kalit so'zlar (masalan
          "premium", "obuna") necha marta uchraganini hisoblaydi.
        </p>

        <div>
          <label className="text-xs text-gray-500 mb-1 flex items-center justify-between">
            <span>Threshold (necha marta yozishmadan keyin "qiziqqan" hisoblansin)</span>
            <span className="font-semibold text-gray-700">{threshold}</span>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={threshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={aiVerify}
            onChange={(e) => onAiVerifyChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          Gemini bilan ikkinchi marta tekshirish (faqat threshold'dan o'tganlar uchun — xarajatni tejaydi)
        </label>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Bekor
          </button>
          <button
            onClick={onStart}
            className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700"
          >
            Tahlilni boshlash
          </button>
        </div>
      </div>
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

  const [showClassifySettings, setShowClassifySettings] = useState(false);
  const [threshold, setThreshold] = useState(3);
  const [aiVerify, setAiVerify] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyJob, setClassifyJob] = useState(null);
  const [classifyError, setClassifyError] = useState(null);

  const [sendFolderId, setSendFolderId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendError, setSendError] = useState(null);

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

  useEffect(() => {
    fetchDialogsClassifyStatus()
      .then((res) => {
        setClassifyJob(res.data);
        setClassifying(res.running);
        if (res.running) pollClassifyStatus();
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

  const pollClassifyStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchDialogsClassifyStatus();
        setClassifyJob(res.data);
        if (!res.running) {
          setClassifying(false);
          clearInterval(interval);
          loadContacts(filters);
        }
      } catch (err) {
        console.error(err);
        clearInterval(interval);
        setClassifying(false);
      }
    }, 3000);
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

  const handleStartClassify = async () => {
    setClassifyError(null);
    try {
      await runDialogsClassify({ threshold, ai_verify: aiVerify });
      setClassifying(true);
      setShowClassifySettings(false);
      pollClassifyStatus();
    } catch (err) {
      setClassifyError(err.message);
    }
  };

  const handleCancelClassify = async () => {
    setClassifyError(null);
    try {
      await cancelDialogsClassify();
    } catch (err) {
      setClassifyError(err.message);
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

  const pollSendJob = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchFolderJob(jobId);
        const job = res.data;
        if (job.status !== 'running') {
          clearInterval(interval);
          setSending(false);
          setSendResult({
            success: job.status === 'completed',
            total: job.total,
            ok_count: job.ok_count,
            overflow_count: job.params_json?.overflow_count || 0,
            error: job.error_message,
          });
        }
      } catch (err) {
        clearInterval(interval);
        setSending(false);
        console.error(err);
      }
    }, 2000);
  };

  const handleSendToFolder = async () => {
    if (!sendFolderId) return;
    setSendError(null);
    setSendResult(null);
    setSending(true);
    try {
      const res = await applyFolderRule(sendFolderId);
      pollSendJob(res.job_id);
    } catch (err) {
      setSending(false);
      setSendError(err.message);
    }
  };

  const exportUrl = exportDialogsXlsxUrl(filters);

  const syncProgressPct = syncJob && syncJob.total > 0 ? Math.round((syncJob.done / syncJob.total) * 100) : 0;
  const classifyProgressPct = classifyJob && classifyJob.total > 0 ? Math.round((classifyJob.done / classifyJob.total) * 100) : 0;
  const classifyEta = classifyJob?.params_json?.eta_seconds != null ? formatEta(classifyJob.params_json.eta_seconds) : null;

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
          <div className="flex items-center gap-2 flex-wrap">
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
                Sinxronlashni to'xtatish
              </button>
            )}

            {!classifying ? (
              <button
                onClick={() => setShowClassifySettings(true)}
                className="text-sm bg-violet-600 text-white rounded-lg px-3 py-1.5 hover:bg-violet-700 whitespace-nowrap"
              >
                Tahlil qilish
              </button>
            ) : (
              <button
                onClick={handleCancelClassify}
                className="text-sm bg-red-600 text-white rounded-lg px-3 py-1.5 hover:bg-red-700 whitespace-nowrap"
              >
                Tahlilni to'xtatish
              </button>
            )}
          </div>
        </div>

        {(syncing || syncJob?.status === 'running') && (
          <div className="flex flex-col gap-1">
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${syncProgressPct}%` }} />
            </div>
            <span className="text-xs text-gray-400">
              Sinxronlash: {syncJob?.done ?? 0} / {syncJob?.total ?? '?'} dialog ko'rib chiqildi
              {syncJob?.ok_count != null ? ` — ${syncJob.ok_count} ta yozildi` : ''}
            </span>
          </div>
        )}

        {!syncing && syncJob && syncJob.status !== 'running' && (
          <div
            className={`text-xs ${
              syncJob.status === 'failed' ? 'text-red-600' : syncJob.status === 'cancelled' ? 'text-gray-400' : 'text-emerald-600'
            }`}
          >
            {syncJob.status === 'completed' &&
              `Oxirgi sinxronizatsiya: ${syncJob.done} ta dialog ko'rib chiqildi, ${syncJob.ok_count} ta yozildi.`}
            {syncJob.status === 'cancelled' && "Oxirgi sinxronizatsiya to'xtatilgan."}
            {syncJob.status === 'failed' && `Oxirgi sinxronizatsiya xatosi: ${syncJob.error_message}`}
          </div>
        )}

        {(classifying || classifyJob?.status === 'running') && (
          <div className="flex flex-col gap-1">
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: `${classifyProgressPct}%` }} />
            </div>
            <span className="text-xs text-gray-400">
              Tahlil: {classifyJob?.done ?? 0} / {classifyJob?.total ?? '?'} kontakt ko'rib chiqildi
              {classifyJob?.ok_count != null ? ` — ${classifyJob.ok_count} ta nomzod topildi` : ''}
              {classifyEta ? ` — ${classifyEta}` : ''}
            </span>
          </div>
        )}

        {!classifying && classifyJob && classifyJob.status !== 'running' && (
          <div
            className={`text-xs ${
              classifyJob.status === 'failed' ? 'text-red-600' : classifyJob.status === 'cancelled' ? 'text-gray-400' : 'text-emerald-600'
            }`}
          >
            {classifyJob.status === 'completed' &&
              `Oxirgi tahlil: ${classifyJob.done} ta kontakt ko'rib chiqildi, ${classifyJob.ok_count} ta nomzod topildi.`}
            {classifyJob.status === 'cancelled' && "Oxirgi tahlil to'xtatilgan."}
            {classifyJob.status === 'failed' && `Oxirgi tahlil xatosi: ${classifyJob.error_message}`}
          </div>
        )}

        {syncError && <div className="text-xs text-red-600">{syncError}</div>}
        {classifyError && <div className="text-xs text-red-600">{classifyError}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <DialogFilters filters={filters} onChange={setFilters} folders={folders} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Nomzodlarni jildga yuborish</h3>
        <p className="text-xs text-gray-500">
          Tanlangan jildning o'z qoidasi (rule) qayta hisoblanib, mos kelgan kontaktlar Telegram jildiga joylanadi.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sendFolderId}
            onChange={(e) => setSendFolderId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Jild tanlang...</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleSendToFolder}
            disabled={!sendFolderId || sending}
            className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "Yuborilmoqda..." : 'Yuborish'}
          </button>
        </div>
        {sendResult && (
          <div className={`text-xs ${sendResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
            {sendResult.success
              ? `Qo'llandi: ${sendResult.total} ta mos topildi, ${sendResult.ok_count} tasi jildga joylandi${
                  sendResult.overflow_count > 0 ? `, ${sendResult.overflow_count} tasi sig'madi` : ''
                }.`
              : `Xato: ${sendResult.error}`}
          </div>
        )}
        {sendError && <div className="text-xs text-red-600">{sendError}</div>}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-gray-500">{pagination ? `${pagination.total} ta natija` : ''}</span>
        <a href={exportUrl} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700">
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
                  <td className="px-4 py-3">
                    <span className="text-gray-600">{c.premium_mentions}</span>
                    {c.ai_rejected && (
                      <span
                        title="Gemini: haqiqiy qiziqish emas deb baholadi"
                        className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400"
                      >
                        AI rad etdi
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.opted_out ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Chiqarilgan
                      </span>
                    ) : (
                      <button onClick={() => handleToggleOptedOut(c)} className="text-xs text-red-500 hover:text-red-700">
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

      {showClassifySettings && (
        <ClassifySettingsModal
          threshold={threshold}
          onThresholdChange={setThreshold}
          aiVerify={aiVerify}
          onAiVerifyChange={setAiVerify}
          onStart={handleStartClassify}
          onClose={() => setShowClassifySettings(false)}
        />
      )}
    </div>
  );
}
