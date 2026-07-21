import { useCallback, useEffect, useState } from 'react';
import ContactBadge from './ContactBadge.jsx';
import {
  runChannelScan,
  cancelChannelScan,
  fetchChannelScanStatus,
  fetchScanSessions,
  fetchScanSession,
  deleteScanSession,
  exportScanSessionCsvUrl,
} from '../lib/api.js';

// Telegram t.me/<username>/<id>?embed=1 — Telegram'ning o'z ochiq "post
// widget"i, API kalitsiz istalgan ochiq xabarni o'z formatida (avatar,
// sana, media) ko'rsatib beradi. Faqat bosilganda yuklanadi (bir vaqtda
// ko'p iframe ochilib ketmasligi uchun).
function ScanResultRow({ r }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ContactBadge contactType={r.contact_type} isBot={r.is_bot} />
            <span className="text-sm text-gray-900">{r.contact_value}</span>
            {r.matched_keyword && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                {r.matched_keyword}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {r.message_date ? new Date(r.message_date).toLocaleString() : ''}
          </div>
          {r.message_excerpt && <div className="text-xs text-gray-400 truncate">"{r.message_excerpt}"</div>}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {r.match_count > 1 && <span className="text-xs text-gray-400">{r.match_count}x</span>}
          {r.message_link && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOpen((o) => !o)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                {previewOpen ? 'Yashirish' : "Xabarni ko'rish"}
              </button>
              <a
                href={r.message_link}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 hover:bg-indigo-100"
              >
                Telegram'da ochish
              </a>
            </div>
          )}
        </div>
      </div>

      {previewOpen && r.message_link && (
        <iframe
          src={`${r.message_link}?embed=1`}
          title={`xabar-${r.id}`}
          className="w-full rounded-lg border border-gray-100"
          style={{ height: 260 }}
          loading="lazy"
        />
      )}
    </div>
  );
}

const STATUS_LABELS = { completed: 'Tugallandi', cancelled: "To'xtatilgan", failed: 'Xato' };
const STATUS_STYLES = {
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-700',
};

// Har bir skanerlash — fayl menejeridagi papka kabi: yopiq holda sarlavha
// + statistika, bosilganda o'sha skanerlashning natijalari (faqat o'ziniki,
// boshqa skanerlash natijalari bilan aralashmaydi) ochiladi.
function SessionFolder({ session, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleOpen = async () => {
    if (!open && results === null) {
      setLoading(true);
      try {
        const res = await fetchScanSession(session.id);
        setResults(res.results);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    setOpen((o) => !o);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteScanSession(session.id);
      onDeleted(session.id);
    } catch (err) {
      console.error(err);
      setDeleting(false);
    }
  };

  const dateRange =
    session.date_from && session.date_to
      ? `${new Date(session.date_from).toLocaleDateString()} – ${new Date(session.date_to).toLocaleDateString()}`
      : '';

  return (
    <div className="border border-gray-100 rounded-lg">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button onClick={toggleOpen} className="flex items-start gap-2 min-w-0 flex-1 text-left">
          <span className="text-lg leading-none mt-0.5">{open ? '📂' : '📁'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900 truncate">
                {session.source_title || session.source_username || '—'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[session.status]}`}>
                {STATUS_LABELS[session.status]}
              </span>
              <span className="text-xs text-gray-400">{session.found_count} ta kontakt</span>
            </div>
            <div className="text-xs text-gray-400 truncate">
              {dateRange}
              {session.keywords ? ` — kalit so'z: ${session.keywords}` : ''} —{' '}
              {new Date(session.createdAt).toLocaleString()}
            </div>
            {session.error_message && (
              <div className="text-xs text-red-500 truncate">{session.error_message}</div>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {session.found_count > 0 && (
            <a
              href={exportScanSessionCsvUrl(session.id)}
              className="text-xs bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1 hover:bg-emerald-100"
            >
              Yuklab olish
            </a>
          )}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-400 hover:text-red-600">
              O'chirish
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-40"
              >
                Tasdiqlash
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">
                Bekor
              </button>
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-3">
          {loading && <div className="text-xs text-gray-400 py-2">yuklanmoqda...</div>}
          {!loading && results?.length === 0 && (
            <div className="text-xs text-gray-400 py-2">Bu skanerlashda kontakt topilmadi.</div>
          )}
          {!loading && results && results.length > 0 && (
            <div className="flex flex-col divide-y divide-gray-100">
              {results.map((r) => (
                <ScanResultRow key={r.id} r={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChannelScanPage() {
  const [identifier, setIdentifier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [keywords, setKeywords] = useState('');

  const [running, setRunning] = useState(false);
  const [lastStats, setLastStats] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetchScanSessions();
      setSessions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    fetchChannelScanStatus()
      .then((res) => {
        setRunning(res.state.running);
        setLastStats(res.state.lastStats);
        setLastError(res.state.lastError);
      })
      .catch(() => {});
  }, []);

  const pollStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchChannelScanStatus();
        if (!res.state.running) {
          setRunning(false);
          setLastStats(res.state.lastStats);
          setLastError(res.state.lastError);
          clearInterval(interval);
          loadSessions();
        }
      } catch (err) {
        console.error(err);
      }
    }, 4000);
  };

  const canStart = identifier.trim().length > 0 && dateFrom && dateTo && !running;

  const handleStart = async () => {
    if (!canStart) return;
    setActionError(null);
    const kw = keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    try {
      await runChannelScan({ identifier: identifier.trim(), dateFrom, dateTo, keywords: kw });
      setRunning(true);
      setLastStats(null);
      setLastError(null);
      pollStatus();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleStop = async () => {
    setActionError(null);
    try {
      await cancelChannelScan();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleSessionDeleted = (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Kanal/Guruh qidiruv</h2>
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Ishlamoqda...
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Bitta kanal yoki guruhning postlari/xabarlari matnidan, belgilangan sana oralig'ida, ochiq yozilgan
          telefon/username'larni yig'adi. Xabar yuboruvchisining o'zi hech qachon saqlanmaydi — faqat matnda
          ochiq yozilgan kontakt. Har bir skanerlash o'zining alohida papkasida saqlanadi.
        </p>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Kanal/guruh @username yoki havola</label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={running}
            placeholder="@elonlar_guruhi yoki https://t.me/elonlar_guruhi"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Sanadan</label>
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={running}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Sanagacha</label>
            <input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={running}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Kalit so'z(lar) — ixtiyoriy, vergul bilan ajrating (bo'sh qoldirilsa barcha kontaktlar yig'iladi)
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            disabled={running}
            placeholder="sotiladi, ijaraga..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3">
          {!running ? (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Boshlash
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="text-sm bg-red-600 text-white rounded-lg px-4 py-2 hover:bg-red-700"
            >
              To'xtatish
            </button>
          )}
          {!canStart && !running && (
            <span className="text-xs text-gray-400">Manzil va sana oralig'ini to'ldiring</span>
          )}
        </div>

        {actionError && <div className="text-xs text-red-600">{actionError}</div>}
        {!running && lastError && <div className="text-xs text-red-600">Oxirgi urinish xatosi: {lastError}</div>}
        {!running && lastStats && !lastError && (
          <div className="text-xs text-gray-500">
            Oxirgi natija: {lastStats.scanned} ta xabar tekshirildi, {lastStats.found} ta kontakt topildi
            {lastStats.hitCap &&
              " — xabarlar chegarasiga yetildi, davr boshigacha to'liq tekshirilmagan bo'lishi mumkin"}
            {lastStats.cancelled ? " — foydalanuvchi tomonidan to'xtatilgan" : ''}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Skanerlashlar {sessions.length > 0 ? `(${sessions.length})` : ''}
        </h3>

        {loadingSessions && <div className="text-xs text-gray-400">yuklanmoqda...</div>}
        {!loadingSessions && sessions.length === 0 && (
          <div className="text-xs text-gray-400">Hozircha skanerlash o'tkazilmagan.</div>
        )}

        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionFolder key={s.id} session={s} onDeleted={handleSessionDeleted} />
          ))}
        </div>
      </div>
    </div>
  );
}
