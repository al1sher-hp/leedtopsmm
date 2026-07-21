import { useCallback, useEffect, useState } from 'react';
import StatsHeader from './components/StatsHeader.jsx';
import Filters from './components/Filters.jsx';
import PipelineControl from './components/PipelineControl.jsx';
import LeadCard from './components/LeadCard.jsx';
import LeadTable from './components/LeadTable.jsx';
import Pagination from './components/Pagination.jsx';
import BlacklistPage from './components/BlacklistPage.jsx';
import ChannelScanPage from './components/ChannelScanPage.jsx';
import {
  fetchLeads,
  fetchStats,
  fetchKeywords,
  updateLeadStatus,
  runPipeline,
  cancelPipeline,
  fetchPipelineStatus,
  exportCsvUrl,
} from './lib/api.js';

const DEFAULT_FILTERS = {
  segment: '',
  contact_type: '',
  status: '',
  category: '',
  lang: '',
  q: '',
  has_phone: '',
  hide_bots: '',
  date_from: '',
  date_to: '',
  matched_keyword: '',
  sort: 'gemini_score desc',
  page: 1,
  limit: 20,
};

const KEYWORDS_STORAGE_KEY = 'leedtopsmm.pipelineKeywords';

export default function App() {
  const [view, setView] = useState('leads');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keywords, setKeywords] = useState([]);

  const [pipelineKeywords, setPipelineKeywords] = useState(
    () => localStorage.getItem(KEYWORDS_STORAGE_KEY) || ''
  );
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineLastStats, setPipelineLastStats] = useState(null);
  const [pipelineLastError, setPipelineLastError] = useState(null);
  const [pipelineActionError, setPipelineActionError] = useState(null);

  const loadLeads = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLeads(f);
      setLeads(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetchStats();
      setStats(res);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadLeads(filters), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    fetchKeywords()
      .then((res) => setKeywords(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPipelineStatus()
      .then((res) => {
        setPipelineRunning(res.state.running);
        setPipelineLastStats(res.state.lastStats);
        setPipelineLastError(res.state.lastError);
      })
      .catch(() => {});
  }, []);

  const handleStatusChange = async (id, status) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await updateLeadStatus(id, status);
      loadStats();
    } catch (err) {
      setError(err.message);
      loadLeads(filters);
    }
  };

  const handleKeywordsChange = (value) => {
    setPipelineKeywords(value);
    localStorage.setItem(KEYWORDS_STORAGE_KEY, value);
  };

  const pollPipelineStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchPipelineStatus();
        if (!res.state.running) {
          setPipelineRunning(false);
          setPipelineLastStats(res.state.lastStats);
          setPipelineLastError(res.state.lastError);
          clearInterval(interval);
          loadLeads(filters);
          loadStats();
        }
      } catch (err) {
        console.error(err);
      }
    }, 4000);
  };

  const handleStartPipeline = async () => {
    const keywords = pipelineKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (keywords.length === 0) return;

    setPipelineActionError(null);
    try {
      await runPipeline(keywords);
      setPipelineRunning(true);
      setPipelineLastStats(null);
      setPipelineLastError(null);
      pollPipelineStatus();
    } catch (err) {
      setPipelineActionError(err.message);
    }
  };

  const handleStopPipeline = async () => {
    setPipelineActionError(null);
    try {
      await cancelPipeline();
    } catch (err) {
      setPipelineActionError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-indigo-600 text-white px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
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

      <main className="max-w-5xl mx-auto px-4 mt-4 flex flex-col gap-4">
        {view === 'blacklist' ? (
          <BlacklistPage />
        ) : view === 'scan' ? (
          <ChannelScanPage />
        ) : (
          <>
            <StatsHeader stats={stats} />

            <PipelineControl
              keywords={pipelineKeywords}
              onKeywordsChange={handleKeywordsChange}
              running={pipelineRunning}
              onStart={handleStartPipeline}
              onStop={handleStopPipeline}
              lastStats={pipelineLastStats}
              lastError={pipelineLastError}
              actionError={pipelineActionError}
            />

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <Filters filters={filters} onChange={setFilters} keywords={keywords} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{pagination ? `${pagination.total} ta natija` : ''}</span>
              <a
                href={exportCsvUrl(filters)}
                className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
              >
                CSV eksport
              </a>
            </div>

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>}
            {loading && <div className="text-sm text-gray-400 text-center py-4">yuklanmoqda...</div>}

            {!loading && leads.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-8">Hech qanday lead topilmadi</div>
            )}

            <div className="md:hidden flex flex-col gap-3">
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
              ))}
            </div>

            <div className="hidden md:block">
              <LeadTable leads={leads} onStatusChange={handleStatusChange} />
            </div>

            <Pagination pagination={pagination} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
          </>
        )}
      </main>
    </div>
  );
}
