import { useCallback, useEffect, useState } from 'react';
import ContactBadge from './ContactBadge.jsx';
import FolderSidebar from './FolderSidebar.jsx';
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

  // O'ng paneldagi papka tanlovi. null = hech narsa tanlanmagan (skanerlash
  // ketayotgan bo'lsa jonli holat, aks holda bo'sh holat ko'rsatiladi).
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  useEffect(() => {
    if (selectedSessionId === null) {
      setSessionDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetchScanSession(selectedSessionId)
      .then((res) => setSessionDetail(res))
      .catch((err) => {
        console.error(err);
        setSessionDetail(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedSessionId]);

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
          // Tugagan skanerlash natijalari ortiqcha bosishsiz darhol ko'rinsin.
          if (res.state.lastStats?.sessionId) {
            setSelectedSessionId(res.state.lastStats.sessionId);
          }
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
      setSelectedSessionId(null);
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

  const handleDeleteSession = async (id) => {
    await deleteScanSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (selectedSessionId === id) setSelectedSessionId(null);
  };

  const sidebarItems = sessions.map((s) => ({
    id: s.id,
    label: s.source_title || s.source_username || `Skanerlash #${s.id}`,
    badge: { text: STATUS_LABELS[s.status], style: STATUS_STYLES[s.status] },
    meta: `${s.found_count} ta kontakt — ${new Date(s.createdAt).toLocaleString()}`,
    errorText: s.error_message,
    downloadUrl: s.found_count > 0 ? exportScanSessionCsvUrl(s.id) : null,
  }));

  const showingLive = running && selectedSessionId === null;

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
      <div className="flex-1 min-w-0">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
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
            ochiq yozilgan kontakt. Har bir skanerlash o'ng paneldagi o'zining alohida papkasida saqlanadi.
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
        </div>

        {showingLive && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
            <span className="text-sm text-gray-600">"{identifier}" skanerlanmoqda, biroz kuting...</span>
          </div>
        )}

        {!showingLive && selectedSessionId !== null && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            {loadingDetail && <div className="text-sm text-gray-400">yuklanmoqda...</div>}
            {!loadingDetail && sessionDetail && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">
                      {sessionDetail.session.source_title || sessionDetail.session.source_username}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {sessionDetail.session.date_from && sessionDetail.session.date_to
                        ? `${new Date(sessionDetail.session.date_from).toLocaleDateString()} – ${new Date(
                            sessionDetail.session.date_to
                          ).toLocaleDateString()}`
                        : ''}
                      {sessionDetail.session.keywords ? ` — kalit so'z: ${sessionDetail.session.keywords}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sessionDetail.results.length > 0 && (
                      <a
                        href={exportScanSessionCsvUrl(selectedSessionId)}
                        className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
                      >
                        CSV eksport
                      </a>
                    )}
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Yopish
                    </button>
                  </div>
                </div>
                {sessionDetail.results.length === 0 ? (
                  <div className="text-xs text-gray-400">Bu skanerlashda kontakt topilmadi.</div>
                ) : (
                  <div className="flex flex-col divide-y divide-gray-100">
                    {sessionDetail.results.map((r) => (
                      <ScanResultRow key={r.id} r={r} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!showingLive && selectedSessionId === null && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-400">
            O'ngdagi ro'yxatdan bir skanerlashni tanlang, yoki yangi qidiruv boshlang.
          </div>
        )}
      </div>
      </div>

      <FolderSidebar
        title="Skanerlashlar"
        items={sidebarItems}
        selectedId={selectedSessionId}
        onSelect={setSelectedSessionId}
        onDelete={handleDeleteSession}
        loading={loadingSessions}
        emptyText="Hozircha skanerlash o'tkazilmagan."
      />
    </div>
  );
}
