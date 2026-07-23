import { useState } from 'react';
import LeadsPage from './components/LeadsPage.jsx';
import BlacklistPage from './components/BlacklistPage.jsx';
import ChannelScanPage from './components/ChannelScanPage.jsx';
import CampaignsPage from './components/CampaignsPage.jsx';
import AccountsPage from './components/AccountsPage.jsx';

const TABS = [
  { id: 'leads',     label: "Lead'lar" },
  { id: 'scan',      label: 'Kanal qidiruv' },
  { id: 'campaigns', label: '📢 Kampaniyalar' },
  { id: 'accounts',  label: '👤 Akkountlar' },
  { id: 'blacklist', label: "Qora ro'yxat" },
];

export default function App() {
  const [view, setView] = useState('leads');

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-indigo-600 text-white px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <h1 className="text-base font-bold shrink-0">TopSMM Dashboard</h1>
          <nav className="flex items-center gap-0.5 bg-indigo-500/50 rounded-lg p-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap ${view === t.id ? 'bg-white text-indigo-700 font-medium' : 'text-indigo-100 hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 mt-4 flex flex-col gap-4">
        {view === 'blacklist'  ? <BlacklistPage />  :
         view === 'scan'       ? <ChannelScanPage /> :
         view === 'campaigns'  ? <CampaignsPage />  :
         view === 'accounts'   ? <AccountsPage />   :
         <LeadsPage />}
      </main>
    </div>
  );
}
