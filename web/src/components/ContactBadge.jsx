const STYLES = {
  phone: 'bg-amber-100 text-amber-800',
  username: 'bg-sky-100 text-sky-800',
  both: 'bg-violet-100 text-violet-800',
  none: 'bg-gray-100 text-gray-500',
};

const LABELS = {
  phone: 'tel',
  username: 'user',
  both: 'tel+user',
  none: "yo'q",
};

export default function ContactBadge({ contactType, isBot }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[contactType] || STYLES.none}`}>
        {LABELS[contactType] || contactType}
      </span>
      {isBot && (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          bot
        </span>
      )}
    </span>
  );
}
