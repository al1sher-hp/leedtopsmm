import SegmentBadge from './SegmentBadge.jsx';
import ContactBadge from './ContactBadge.jsx';
import StatusDropdown from './StatusDropdown.jsx';

export default function LeadTable({ leads, onStatusChange }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3">Kanal</th>
            <th className="px-4 py-3">Turi</th>
            <th className="px-4 py-3">Obunachi</th>
            <th className="px-4 py-3">Segment</th>
            <th className="px-4 py-3">Ball</th>
            <th className="px-4 py-3">Kontakt</th>
            <th className="px-4 py-3">Holat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{lead.channel_title}</div>
                {lead.channel_username && (
                  <a
                    href={`https://t.me/${lead.channel_username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 text-xs"
                  >
                    @{lead.channel_username}
                  </a>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600">{lead.type === 'group' ? 'guruh' : 'kanal'}</td>
              <td className="px-4 py-3 text-gray-600">{lead.subs != null ? lead.subs.toLocaleString() : '-'}</td>
              <td className="px-4 py-3">
                <SegmentBadge segment={lead.segment} />
              </td>
              <td className="px-4 py-3 font-semibold text-gray-900">{lead.gemini_score ?? '-'}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <ContactBadge contactType={lead.contact_type} />
                  {lead.phone && <span className="text-xs text-gray-600">{lead.phone}</span>}
                  {lead.contact_username && <span className="text-xs text-gray-600">@{lead.contact_username}</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusDropdown status={lead.status} onChange={(status) => onStatusChange(lead.id, status)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
