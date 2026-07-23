// Standart holat — nisbiy "/api/..." (bir domenda joylashgan dashboard + API
// uchun, masalan bitta Vercel loyihasi). Lokal devda buni Vite proksisi
// (vite.config.js) localhost:4000'ga yo'naltiradi. Dashboard va API turli
// domenlarda bo'lsa (masalan Vercel + Railway), VITE_API_URL'ga API'ning
// to'liq manzilini bering.
const API_URL = import.meta.env.VITE_API_URL || '';

// Pipeline (Telegram discovery) faqat doim ishlaydigan hostda (Render/Railway/VPS)
// ishlaydi — Vercel'da har doim 501 qaytaradi. Shuning uchun faqat pipeline
// chaqiruvlari (run/status) VITE_PIPELINE_API_URL'ga (masalan Render manziliga)
// yuboriladi, qolgan hamma narsa (leads/stats/csv) tezroq API_URL'da qoladi.
// Berilmasa API_URL'ga tushadi (bitta host'da hammasi ishlaydigan holat uchun).
const PIPELINE_API_URL = import.meta.env.VITE_PIPELINE_API_URL || API_URL;

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

async function request(path, options = {}, baseUrl = API_URL) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `So'rov xatosi: ${res.status}`);
  }
  return res.json();
}

export function fetchLeads(params) {
  const query = new URLSearchParams(cleanParams(params)).toString();
  return request(`/api/leads?${query}`);
}

export function fetchStats() {
  return request('/api/stats');
}

export function fetchKeywords() {
  return request('/api/leads/keywords');
}

export function updateLeadStatus(id, status) {
  return request(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function runPipeline(keywords) {
  return request(
    '/api/pipeline/run',
    { method: 'POST', body: JSON.stringify({ keywords }) },
    PIPELINE_API_URL
  );
}

export function cancelPipeline() {
  return request('/api/pipeline/cancel', { method: 'POST' }, PIPELINE_API_URL);
}

export function fetchPipelineStatus() {
  return request('/api/pipeline/status', {}, PIPELINE_API_URL);
}

export function exportCsvUrl(params) {
  const query = new URLSearchParams(cleanParams(params)).toString();
  return `${API_URL}/api/leads/export.csv?${query}`;
}

// Har bir pipeline yugurishi o'z "papkasida" — DB'dan o'qilgani uchun tez
// API host'ida (Telegram ulanishi shart emas).
export function fetchPipelineRuns() {
  return request('/api/pipeline/runs');
}

export function fetchPipelineRunLeads(id) {
  return request(`/api/pipeline/runs/${id}`);
}

export function deletePipelineRun(id) {
  return request(`/api/pipeline/runs/${id}`, { method: 'DELETE' });
}

export function exportPipelineRunCsvUrl(id, params) {
  const query = new URLSearchParams(cleanParams(params)).toString();
  return `${API_URL}/api/pipeline/runs/${id}/export.csv${query ? `?${query}` : ''}`;
}

// Ro'yxatni o'qish DB'dan bo'lgani uchun tez API host'ida qoladi, lekin
// so'rov/tasdiqlash egalikni Telegram orqali tekshirgani uchun (getPool())
// pipeline bilan bir xil doim-ishlaydigan hostga yuboriladi.
export function fetchBlacklist() {
  return request('/api/blacklist');
}

export function requestBlacklist(identifier) {
  return request(
    '/api/blacklist/request',
    { method: 'POST', body: JSON.stringify({ identifier }) },
    PIPELINE_API_URL
  );
}

export function verifyBlacklist(targetId) {
  return request(
    '/api/blacklist/verify',
    { method: 'POST', body: JSON.stringify({ targetId }) },
    PIPELINE_API_URL
  );
}

export function requestBlacklistRemoval(targetId) {
  return request(`/api/blacklist/${encodeURIComponent(targetId)}/remove-request`, { method: 'POST' }, PIPELINE_API_URL);
}

// Skanerlash ham getPool() (jonli Telegram ulanishi) talab qiladi, shuning
// uchun run/cancel/status pipeline bilan bir xil doim-ishlaydigan hostga
// yuboriladi; natijalarni o'qish/eksport DB'dan bo'lgani uchun tez API host'ida.
export function runChannelScan({ identifier, dateFrom, dateTo, keywords, captureSenders = false }) {
  return request(
    '/api/scan/run',
    { method: 'POST', body: JSON.stringify({ identifier, dateFrom, dateTo, keywords, captureSenders }) },
    PIPELINE_API_URL
  );
}

export function promoteSessionToLead(sessionId) {
  return request(`/api/scan/sessions/${sessionId}/promote`, { method: 'POST' });
}

export function cancelChannelScan() {
  return request('/api/scan/cancel', { method: 'POST' }, PIPELINE_API_URL);
}

export function fetchChannelScanStatus() {
  return request('/api/scan/status', {}, PIPELINE_API_URL);
}

// Har bir skanerlash o'z sessiyasida ("papka") saqlanadi — quyidagilar shu
// sessiyalar bilan ishlaydi.
export function fetchScanSessions() {
  return request('/api/scan/sessions');
}

export function fetchScanSession(id) {
  return request(`/api/scan/sessions/${id}`);
}

export function deleteScanSession(id) {
  return request(`/api/scan/sessions/${id}`, { method: 'DELETE' });
}

export function exportScanSessionCsvUrl(id) {
  return `${API_URL}/api/scan/sessions/${id}/export.csv`;
}

export default {
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
  fetchBlacklist,
  requestBlacklist,
  verifyBlacklist,
  requestBlacklistRemoval,
  runChannelScan,
  cancelChannelScan,
  fetchChannelScanStatus,
  fetchScanSessions,
  fetchScanSession,
  deleteScanSession,
  exportScanSessionCsvUrl,
  promoteSessionToLead,
};
