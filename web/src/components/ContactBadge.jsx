const STYLES = {
  phone: 'bg-amber-100 text-amber-800',
  username: 'bg-sky-100 text-sky-800',
  both: 'bg-violet-100 text-violet-800',
  none: 'bg-gray-100 text-gray-500',
  bot: 'bg-orange-100 text-orange-800',
};

const LABELS = {
  phone: 'tel',
  username: 'user',
  both: 'tel+user',
  none: "yo'q",
};

// contact_username bot ekanligi tasdiqlangan bo'lsa (contact_is_bot), "user"
// yorlig'i "bot"ga almashtiriladi — masalan "tel+user" emas "tel+bot" —
// alohida qo'shimcha belgi emas, yagona aniq yorliq sifatida ko'rsatiladi.
export default function ContactBadge({ contactType, isBot }) {
  const hasUsername = contactType === 'username' || contactType === 'both';
  const showAsBot = isBot && hasUsername;

  const style = showAsBot ? STYLES.bot : STYLES[contactType] || STYLES.none;
  const label = showAsBot
    ? contactType === 'both'
      ? 'tel+bot'
      : 'bot'
    : LABELS[contactType] || contactType;

  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>{label}</span>;
}
