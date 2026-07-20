import { useMemo, useState } from 'react';

// Ko'p (masalan 100 ta) kalit so'z ichidan qidirib, bir yoki bir nechtasini
// tanlab filtrlash uchun qidiruvli, ko'p tanlovli combobox.
export default function KeywordFilter({ keywords, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return keywords;
    return keywords.filter((k) => k.toLowerCase().includes(term));
  }, [keywords, search]);

  const toggle = (keyword) => {
    if (selected.includes(keyword)) {
      onChange(selected.filter((k) => k !== keyword));
    } else {
      onChange([...selected, keyword]);
    }
  };

  if (keywords.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white"
      >
        <span className="text-gray-600">
          {selected.length > 0 ? `${selected.length} ta kalit so'z tanlangan` : "Kalit so'z bo'yicha filtrlash"}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((k) => (
            <span
              key={k}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800"
            >
              {k}
              <button type="button" onClick={() => toggle(k)} className="text-indigo-500 hover:text-indigo-900">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kalit so'z qidirish..."
            className="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">Hech narsa topilmadi</div>
            )}
            {filtered.map((k) => (
              <label
                key={k}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(k)}
                  onChange={() => toggle(k)}
                  className="rounded border-gray-300"
                />
                {k}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
