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

export default {
  fetchLeads,
  fetchStats,
  fetchKeywords,
  updateLeadStatus,
  runPipeline,
  cancelPipeline,
  fetchPipelineStatus,
  exportCsvUrl,
};
