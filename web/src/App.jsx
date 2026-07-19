import { useCallback, useEffect, useState } from 'react';
import StatsHeader from './components/StatsHeader.jsx';
import Filters from './components/Filters.jsx';
import LeadCard from './components/LeadCard.jsx';
import LeadTable from './components/LeadTable.jsx';
import Pagination from './components/Pagination.jsx';
import {
  fetchLeads,
  fetchStats,
  updateLeadStatus,
  runPipeline,
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
  sort: 'gemini_score desc',
  page: 1,
  limit: 20,
};

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);

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
    fetchPipelineStatus()
      .then((res) => setPipelineRunning(res.state.running))
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

  const handleRunPipeline = async () => {
    try {
      await runPipeline();
      setPipelineRunning(true);
      const interval = setInterval(async () => {
        const res = await fetchPipelineStatus();
        if (!res.state.running) {
          setPipelineRunning(false);
          clearInterval(interval);
          loadLeads(filters);
          loadStats();
        }
      }, 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-indigo-600 text-white px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">TopSMM Lead Dashboard</h1>
          <button
            onClick={handleRunPipeline}
            disabled={pipelineRunning}
            className="text-xs bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {pipelineRunning ? 'Ishlamoqda...' : 'Pipeline ishga tushirish'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-4 flex flex-col gap-4">
        <StatsHeader stats={stats} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <Filters filters={filters} onChange={setFilters} />
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
      </main>
    </div>
  );
}
