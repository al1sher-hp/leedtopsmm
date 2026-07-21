import SegmentBadge from './SegmentBadge.jsx';
import ContactBadge from './ContactBadge.jsx';
import StatusDropdown from './StatusDropdown.jsx';

export default function LeadCard({ lead, onStatusChange }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 leading-tight">{lead.channel_title}</h3>
          {lead.channel_username && (
            <a
              href={`https://t.me/${lead.channel_username}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-indigo-600"
            >
              @{lead.channel_username}
            </a>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-gray-900">{lead.gemini_score ?? '-'}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">ball</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <SegmentBadge segment={lead.segment} />
        <ContactBadge contactType={lead.contact_type} isBot={lead.contact_is_bot} />
        {lead.subs != null && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {lead.subs.toLocaleString()} obunachi
          </span>
        )}
        {lead.type && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {lead.type === 'group' ? 'guruh' : 'kanal'}
          </span>
        )}
      </div>

      <div className="text-sm text-gray-700 flex flex-col gap-0.5">
        {lead.phone && <div>Telefon: {lead.phone}</div>}
        {lead.contact_username && (
          <div>{lead.contact_is_bot ? 'Bot' : 'Foydalanuvchi'}: @{lead.contact_username}</div>
        )}
        {!lead.phone && !lead.contact_username && <div className="text-gray-400">kontakt topilmadi</div>}
      </div>

      {lead.score_reason && <p className="text-xs text-gray-500 line-clamp-2">{lead.score_reason}</p>}

      <div className="flex items-center justify-between pt-1 border-t border-gray-100 mt-1">
        <span className="text-xs text-gray-400">{lead.category || ''}</span>
        <StatusDropdown status={lead.status} onChange={(status) => onStatusChange(lead.id, status)} />
      </div>
    </div>
  );
}
