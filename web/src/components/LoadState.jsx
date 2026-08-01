// Yuklanmoqda / xato / bo'sh — uch holatni ANIQ ajratadigan umumiy komponent.
// Muammo: so'rov 500 bilan yiqilganda ba'zi sahifalar buni "bo'sh ro'yxat"
// deb ko'rsatib, foydalanuvchini chalg'itardi (production'da jadval
// yetishmagani shu sabab kunlarcha sezilmagan). Xato HAR DOIM qizil banner +
// serverdan kelgan xato matni + "Qayta urinish" tugmasi bilan ko'rsatiladi,
// bo'sh ro'yxat bilan aralashtirilmaydi.

export function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-2 text-sm text-red-700">
        <span className="shrink-0">⚠️</span>
        <span>{message || "Noma'lum xato yuz berdi"}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-700 shrink-0"
        >
          Qayta urinish
        </button>
      )}
    </div>
  );
}

export default function LoadState({
  loading,
  error,
  onRetry,
  empty,
  emptyTitle = "Hech narsa topilmadi",
  emptyHint,
  loadingText = 'Yuklanmoqda…',
  children,
}) {
  if (loading) {
    return <div className="text-center py-12 text-gray-400">{loadingText}</div>;
  }
  if (error) {
    return (
      <div className="py-2">
        <ErrorBanner message={error} onRetry={onRetry} />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg mb-2">{emptyTitle}</p>
        {emptyHint && <p className="text-sm">{emptyHint}</p>}
      </div>
    );
  }
  return children;
}
