import { SEGMENT_LABELS } from '../lib/labels.js';

const SEGMENT_COLORS = {
  reseller: '#10b981',
  grower: '#3b82f6',
  other: '#9ca3af',
  unscored: '#e5e7eb',
};

function Donut({ data }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return <div className="text-xs text-gray-400">ma'lumot yo'q</div>;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="14" />
      {entries.map(([key, value]) => {
        const fraction = value / total;
        const dash = fraction * circumference;
        const circle = (
          <circle
            key={key}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={SEGMENT_COLORS[key] || '#9ca3af'}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          />
        );
        offset += dash;
        return circle;
      })}
    </svg>
  );
}

export default function StatsHeader({ stats }) {
  if (!stats) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">
        yuklanmoqda...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="grid grid-cols-4 gap-2 text-center mb-4">
        <div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500">jami lead</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-emerald-600">{stats.withPhone}</div>
          <div className="text-xs text-gray-500">telefonli</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-sky-600">{stats.withUsername}</div>
          <div className="text-xs text-gray-500">username'li</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-orange-600">{stats.withBotContact ?? 0}</div>
          <div className="text-xs text-gray-500">bot kontakt</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Donut data={stats.bySegment || {}} />
        <div className="flex flex-col gap-1 text-xs">
          {Object.entries(stats.bySegment || {}).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: SEGMENT_COLORS[key] || '#9ca3af' }}
              />
              <span className="text-gray-600">
                {SEGMENT_LABELS[key] || key}: {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
