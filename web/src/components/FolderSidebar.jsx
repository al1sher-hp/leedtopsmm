import { useState } from 'react';

// Ikkala "papka" ro'yxati (Lead'lar/pipeline yugurishlari, Kanal
// qidiruv/skanerlash sessiyalari) uchun umumiy o'ng panel — fayl
// menejeridagi papkalar kabi ixcham, tanlangani ajratib ko'rsatiladi.
export default function FolderSidebar({
  title,
  items,
  selectedId,
  onSelect,
  onDelete,
  loading,
  emptyText = "Hozircha hech narsa yo'q.",
  allOption,
  deleteWarning,
}) {
  const [confirmingId, setConfirmingId] = useState(null);

  const handleDelete = async (id) => {
    if (!onDelete) return;
    await onDelete(id);
    setConfirmingId(null);
  };

  return (
    <div className="w-full lg:w-72 shrink-0 bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col gap-1 lg:self-start">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">{title}</h3>

      {allOption && (
        <button
          onClick={() => onSelect(null)}
          className={`text-left px-2 py-2 rounded-lg text-sm ${
            selectedId === null ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          {allOption}
        </button>
      )}

      {loading && <div className="text-xs text-gray-400 px-2 py-2">yuklanmoqda...</div>}
      {!loading && items.length === 0 && <div className="text-xs text-gray-400 px-2 py-2">{emptyText}</div>}

      <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border ${
              selectedId === item.id ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <button onClick={() => onSelect(item.id)} className="w-full text-left px-2 py-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm text-gray-900 truncate">{item.label}</span>
                {item.badge && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${item.badge.style}`}>
                    {item.badge.text}
                  </span>
                )}
              </div>
              {item.meta && <div className="text-xs text-gray-400 truncate">{item.meta}</div>}
              {item.errorText && <div className="text-xs text-red-500 truncate">{item.errorText}</div>}
            </button>

            <div className="flex items-center gap-2 px-2 pb-1.5">
              {item.downloadUrl && (
                <a
                  href={item.downloadUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-emerald-700 hover:text-emerald-900"
                >
                  Yuklab olish
                </a>
              )}
              {onDelete &&
                (confirmingId === item.id ? (
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-[11px] text-red-600 font-medium hover:text-red-800"
                    >
                      Tasdiqlash
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="text-[11px] text-gray-400 hover:text-gray-600"
                    >
                      Bekor
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(item.id)}
                    className="text-[11px] text-gray-400 hover:text-red-600"
                  >
                    O'chirish
                  </button>
                ))}
            </div>
            {confirmingId === item.id && deleteWarning && (
              <div className="text-[11px] text-gray-400 px-2 pb-2">{deleteWarning}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
