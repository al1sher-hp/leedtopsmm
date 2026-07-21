import { useCallback, useEffect, useState } from 'react';
import ContactBadge from './ContactBadge.jsx';
import {
  runChannelScan,
  cancelChannelScan,
  fetchChannelScanStatus,
  fetchScanResults,
  exportScanCsvUrl,
} from '../lib/api.js';

export default function ChannelScanPage() {
  const [identifier, setIdentifier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [keywords, setKeywords] = useState('');

  const [running, setRunning] = useState(false);
  const [lastStats, setLastStats] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const loadResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const res = await fetchScanResults({ page: 1, limit: 50 });
      setResults(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

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
          loadResults();
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
          ochiq yozilgan kontakt.
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
            Oxirgi natija: {lastStats.scanned} ta xabar tekshirildi, {lastStats.found} ta kontakt topildi (
            {lastStats.created} ta yangi, {lastStats.updated} ta yangilandi)
            {lastStats.hitCap &&
              " — xabarlar chegarasiga yetildi, davr boshigacha to'liq tekshirilmagan bo'lishi mumkin"}
            {lastStats.cancelled ? " — foydalanuvchi tomonidan to'xtatilgan" : ''}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Topilgan kontaktlar {pagination ? `(${pagination.total})` : ''}
          </h3>
          <a
            href={exportScanCsvUrl({})}
            className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
          >
            CSV eksport
          </a>
        </div>

        {loadingResults && <div className="text-xs text-gray-400">yuklanmoqda...</div>}
        {!loadingResults && results.length === 0 && (
          <div className="text-xs text-gray-400">Hozircha natija yo'q.</div>
        )}

        <div className="flex flex-col divide-y divide-gray-100">
          {results.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 py-2">
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
                  {r.source_title} {r.source_username ? `(@${r.source_username})` : ''} —{' '}
                  {r.message_date ? new Date(r.message_date).toLocaleString() : ''}
                </div>
                {r.message_excerpt && <div className="text-xs text-gray-400 truncate">"{r.message_excerpt}"</div>}
              </div>
              {r.match_count > 1 && <span className="text-xs text-gray-400 shrink-0">{r.match_count}x</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
