const SEGMENTS = ['reseller', 'grower', 'other'];
const CONTACT_TYPES = ['phone', 'username', 'both', 'none'];
const STATUSES = ['new', 'contacted', 'replied', 'client', 'rejected'];
const LANGS = ['uz', 'ru', 'other'];

export default function Filters({ filters, onChange }) {
  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 });

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Qidirish (nom, username, tavsif)..."
        value={filters.q || ''}
        onChange={(e) => set('q', e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select
          value={filters.segment || ''}
          onChange={(e) => set('segment', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Segment: hammasi</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.contact_type || ''}
          onChange={(e) => set('contact_type', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Kontakt: hammasi</option>
          {CONTACT_TYPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.status || ''}
          onChange={(e) => set('status', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Status: hammasi</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.lang || ''}
          onChange={(e) => set('lang', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Til: hammasi</option>
          {LANGS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={filters.has_phone === 'true'}
          onChange={(e) => set('has_phone', e.target.checked ? 'true' : '')}
          className="rounded border-gray-300"
        />
        Faqat telefonli lead'lar
      </label>
    </div>
  );
}
