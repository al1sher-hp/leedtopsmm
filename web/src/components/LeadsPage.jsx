import { useCallback, useEffect, useState } from 'react';
import StatsHeader from './StatsHeader.jsx';
import Filters from './Filters.jsx';
import PipelineControl from './PipelineControl.jsx';
import LeadCard from './LeadCard.jsx';
import LeadTable from './LeadTable.jsx';
import Pagination from './Pagination.jsx';
import FolderSidebar from './FolderSidebar.jsx';
import {
  fetchLeads,
  fetchStats,
  fetchKeywords,
  updateLeadStatus,
  runPipeline,
  cancelPipeline,
  fetchPipelineStatus,
  exportCsvUrl,
  fetchPipelineRuns,
  fetchPipelineRunLeads,
  deletePipelineRun,
  exportPipelineRunCsvUrl,
} from '../lib/api.js';

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

const RUN_STATUS_LABELS = { running: 'Ishlamoqda', completed: 'Tugallandi', cancelled: "To'xtatilgan", failed: 'Xato' };
const RUN_STATUS_STYLES = {
  running: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-700',
};

export default function LeadsPage() {
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

  // Har bir pipeline yugurishi — o'ng paneldagi "papka". null = Hammasi
  // (global ko'rinish, standart holat).
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);

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

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetchPipelineRuns();
      setRuns(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRuns(false);
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
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    fetchPipelineStatus()
      .then((res) => {
        setPipelineRunning(res.state.running);
        setPipelineLastStats(res.state.lastStats);
        setPipelineLastError(res.state.lastError);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedRunId === null) {
      setRunDetail(null);
      return;
    }
    setLoadingRunDetail(true);
    fetchPipelineRunLeads(selectedRunId)
      .then((res) => setRunDetail(res))
      .catch((err) => {
        console.error(err);
        setRunDetail(null);
      })
      .finally(() => setLoadingRunDetail(false));
  }, [selectedRunId]);

  const showingRun = selectedRunId !== null;
  const displayLeads = showingRun ? runDetail?.leads || [] : leads;
  const isLoading = showingRun ? loadingRunDetail : loading;

  const refreshCurrentView = () => {
    if (showingRun) {
      fetchPipelineRunLeads(selectedRunId).then(setRunDetail).catch(() => {});
    } else {
      loadLeads(filters);
    }
  };

  const handleStatusChange = async (id, status) => {
    if (showingRun) {
      setRunDetail((prev) =>
        prev ? { ...prev, leads: prev.leads.map((l) => (l.id === id ? { ...l, status } : l)) } : prev
      );
    } else {
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    }
    try {
      await updateLeadStatus(id, status);
      loadStats();
    } catch (err) {
      setError(err.message);
      refreshCurrentView();
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
          loadRuns();
        }
      } catch (err) {
        console.error(err);
      }
    }, 4000);
  };

  const handleStartPipeline = async () => {
    const kw = pipelineKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (kw.length === 0) return;

    setPipelineActionError(null);
    try {
      await runPipeline(kw);
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

  const handleDeleteRun = async (id) => {
    await deletePipelineRun(id);
    setRuns((prev) => prev.filter((r) => r.id !== id));
    if (selectedRunId === id) setSelectedRunId(null);
  };

  const sidebarItems = runs.map((r) => {
    const total = r.created_count + r.updated_count;
    return {
      id: r.id,
      label: r.keywords || `Yugurish #${r.id}`,
      badge: { text: RUN_STATUS_LABELS[r.status], style: RUN_STATUS_STYLES[r.status] },
      meta: `${total} ta lead — ${new Date(r.createdAt).toLocaleString()}`,
      errorText: r.error_message,
      downloadUrl: total > 0 ? exportPipelineRunCsvUrl(r.id) : null,
    };
  });

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
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

        {showingRun ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  {runDetail?.run?.keywords || `Yugurish #${selectedRunId}`}
                </h3>
                {runDetail?.run && (
                  <p className="text-xs text-gray-400">
                    {new Date(runDetail.run.createdAt).toLocaleString()} — {displayLeads.length} ta lead
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={exportPipelineRunCsvUrl(selectedRunId)}
                  className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
                >
                  CSV eksport
                </a>
                <button
                  onClick={() => setSelectedRunId(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Yopish
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}

        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {isLoading && <div className="text-sm text-gray-400 text-center py-4">yuklanmoqda...</div>}

        {!isLoading && displayLeads.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-8">Hech qanday lead topilmadi</div>
        )}

        <div className="md:hidden flex flex-col gap-3">
          {displayLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
          ))}
        </div>

        <div className="hidden md:block">
          <LeadTable leads={displayLeads} onStatusChange={handleStatusChange} />
        </div>

        {!showingRun && (
          <Pagination pagination={pagination} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
        )}
      </div>

      <FolderSidebar
        title="Pipeline yugurishlari"
        items={sidebarItems}
        selectedId={selectedRunId}
        onSelect={setSelectedRunId}
        onDelete={handleDeleteRun}
        loading={loadingRuns}
        allOption="Hammasi"
        deleteWarning="Faqat guruhlash o'chadi — lead'lar saqlanib qoladi."
      />
    </div>
  );
}
