export default function PipelineControl({
  keywords,
  onKeywordsChange,
  running,
  onStart,
  onStop,
  lastStats,
  lastError,
  actionError,
}) {
  const canStart = keywords.trim().length > 0 && !running;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Pipeline (Telegram qidiruv)</h2>
        {running && (
          <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Ishlamoqda...
          </span>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Kalit so'zlar — vergul bilan ajrating (masalan: Toshkent, biznes, SMM, reklama)
        </label>
        <input
          type="text"
          value={keywords}
          onChange={(e) => onKeywordsChange(e.target.value)}
          disabled={running}
          placeholder="Toshkent, biznes, reklama, SMM..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex items-center gap-3">
        {!running ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ishga tushirish
          </button>
        ) : (
          <button
            onClick={onStop}
            className="text-sm bg-red-600 text-white rounded-lg px-4 py-2 hover:bg-red-700"
          >
            To'xtatish
          </button>
        )}
        {!canStart && !running && (
          <span className="text-xs text-gray-400">Kamida bitta kalit so'z kiriting</span>
        )}
      </div>

      {actionError && <div className="text-xs text-red-600">{actionError}</div>}

      {!running && lastError && (
        <div className="text-xs text-red-600">Oxirgi urinish xatosi: {lastError}</div>
      )}

      {!running && lastStats && !lastError && (
        <div className="text-xs text-gray-500">
          Oxirgi natija: {lastStats.created} ta yangi, {lastStats.updated} ta yangilandi,{' '}
          {lastStats.skipped} ta o'tkazib yuborildi
          {lastStats.cancelled ? " — foydalanuvchi tomonidan to'xtatilgan" : ''}
        </div>
      )}
    </div>
  );
}
