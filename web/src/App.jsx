import { useState } from 'react';
import LeadsPage from './components/LeadsPage.jsx';
import BlacklistPage from './components/BlacklistPage.jsx';
import ChannelScanPage from './components/ChannelScanPage.jsx';

export default function App() {
  const [view, setView] = useState('leads');

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-indigo-600 text-white px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">TopSMM Lead Dashboard</h1>
          <nav className="flex items-center gap-1 bg-indigo-500/50 rounded-lg p-1">
            <button
              onClick={() => setView('leads')}
              className={`text-sm px-3 py-1 rounded-md ${view === 'leads' ? 'bg-white text-indigo-700' : 'text-indigo-100'}`}
            >
              Lead'lar
            </button>
            <button
              onClick={() => setView('scan')}
              className={`text-sm px-3 py-1 rounded-md ${view === 'scan' ? 'bg-white text-indigo-700' : 'text-indigo-100'}`}
            >
              Kanal qidiruv
            </button>
            <button
              onClick={() => setView('blacklist')}
              className={`text-sm px-3 py-1 rounded-md ${view === 'blacklist' ? 'bg-white text-indigo-700' : 'text-indigo-100'}`}
            >
              Qora ro'yxat
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 mt-4 flex flex-col gap-4">
        {view === 'blacklist' ? <BlacklistPage /> : view === 'scan' ? <ChannelScanPage /> : <LeadsPage />}
      </main>
    </div>
  );
}
