import { useCallback, useEffect, useState } from 'react';
import { fetchBlacklist, requestBlacklist, verifyBlacklist, requestBlacklistRemoval } from '../lib/api.js';

const TYPE_LABELS = { channel: 'Kanal', group: 'Guruh', bot: 'Bot' };

function VerificationCard({ pending, onVerify, onCancel, verifying, verifyError }) {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col gap-2">
      <div className="text-sm font-semibold text-indigo-900">
        {pending.mode === 'remove' ? "Olib tashlashni tasdiqlash" : 'Egalikni tasdiqlash'}: {pending.targetTitle}
      </div>
      <p className="text-sm text-indigo-800">{pending.instructions}</p>
      <div className="flex items-center gap-2">
        <code className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-sm font-mono text-indigo-900">
          {pending.verificationCode}
        </code>
      </div>
      <p className="text-xs text-indigo-600">
        Kod {new Date(pending.expiresAt).toLocaleTimeString()}gacha amal qiladi. Tavsifga qo'ygandan so'ng pastdagi
        tugmani bosing — istalgan vaqt kodni olib tashlashingiz mumkin, bu faqat tekshiruv uchun.
      </p>
      {verifyError && <div className="text-xs text-red-600">{verifyError}</div>}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onVerify}
          disabled={verifying}
          className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-40"
        >
          {verifying ? 'Tekshirilmoqda...' : 'Tasdiqlash'}
        </button>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
          Bekor qilish
        </button>
      </div>
    </div>
  );
}

export default function BlacklistPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  const [pending, setPending] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  const [entries, setEntries] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [removeErrorId, setRemoveErrorId] = useState(null);

  const loadEntries = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetchBlacklist();
      setEntries(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setInfoMessage(null);
    try {
      const res = await requestBlacklist(identifier.trim());
      if (res.alreadyActive) {
        setInfoMessage(res.message);
        setPending(null);
      } else {
        setPending({ ...res, mode: 'add' });
      }
      setIdentifier('');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (!pending) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await verifyBlacklist(pending.targetId);
      if (res.activated) {
        setInfoMessage(
          `"${pending.targetTitle}" qora ro'yxatga qo'shildi.` +
            (res.purgedLeads > 0 ? ` Avval yig'ilgan ${res.purgedLeads} ta yozuv o'chirildi.` : '')
        );
      } else if (res.removed) {
        setInfoMessage(`"${pending.targetTitle}" qora ro'yxatdan olib tashlandi.`);
      }
      setPending(null);
      loadEntries();
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleRemoveRequest = async (entry) => {
    setRemoveErrorId(null);
    try {
      const res = await requestBlacklistRemoval(entry.target_id);
      setPending({ ...res, mode: 'remove' });
      setInfoMessage(null);
    } catch (err) {
      setRemoveErrorId(entry.target_id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Qora ro'yxat</h2>
          <p className="text-xs text-gray-500 mt-1">
            O'z kanalingiz, guruhingiz yoki botingizni bu yerga qo'shsangiz, tizim undan hech qanday ma'lumot
            yig'maydi — bu qoida tizim adminlari uchun ham istisnosiz amal qiladi. Istalgan vaqtda xuddi shu
            tasdiqlash usuli bilan ro'yxatdan olib tashlashingiz mumkin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="@username yoki https://t.me/username"
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={submitting || !identifier.trim()}
            className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-40"
          >
            {submitting ? 'Yuborilmoqda...' : "Qo'shish"}
          </button>
        </form>

        {submitError && <div className="text-xs text-red-600">{submitError}</div>}
        {infoMessage && <div className="text-xs text-emerald-700">{infoMessage}</div>}

        {pending && (
          <VerificationCard
            pending={pending}
            onVerify={handleVerify}
            onCancel={() => setPending(null)}
            verifying={verifying}
            verifyError={verifyError}
          />
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Faol qora ro'yxat {entries.length > 0 ? `(${entries.length})` : ''}
        </h3>
        {loadingList && <div className="text-xs text-gray-400">yuklanmoqda...</div>}
        {!loadingList && entries.length === 0 && (
          <div className="text-xs text-gray-400">Hozircha hech kim qo'shilmagan.</div>
        )}
        <div className="flex flex-col divide-y divide-gray-100">
          {entries.map((entry) => (
            <div key={entry.target_id} className="flex items-center justify-between py-2 gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
                    {TYPE_LABELS[entry.target_type] || entry.target_type}
                  </span>
                  <span className="text-sm text-gray-900 truncate">{entry.target_title}</span>
                </div>
                {entry.target_username && (
                  <div className="text-xs text-gray-400">@{entry.target_username}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  onClick={() => handleRemoveRequest(entry)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  Olib tashlash
                </button>
                {removeErrorId === entry.target_id && (
                  <span className="text-xs text-red-600">Xato — qayta urinib ko'ring</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
