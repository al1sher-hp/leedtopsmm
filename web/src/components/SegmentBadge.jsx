import { SEGMENT_LABELS } from '../lib/labels.js';

const STYLES = {
  reseller: 'bg-emerald-100 text-emerald-800',
  grower: 'bg-blue-100 text-blue-800',
  other: 'bg-gray-100 text-gray-700',
};

export default function SegmentBadge({ segment }) {
  if (!segment) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
        {SEGMENT_LABELS.unscored}
      </span>
    );
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[segment] || STYLES.other}`}>
      {SEGMENT_LABELS[segment] || segment}
    </span>
  );
}
