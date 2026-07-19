const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
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

export function updateLeadStatus(id, status) {
  return request(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function runPipeline() {
  return request('/api/pipeline/run', { method: 'POST' });
}

export function fetchPipelineStatus() {
  return request('/api/pipeline/status');
}

export function exportCsvUrl(params) {
  const query = new URLSearchParams(cleanParams(params)).toString();
  return `${API_URL}/api/leads/export.csv?${query}`;
}

export default { fetchLeads, fetchStats, updateLeadStatus, runPipeline, fetchPipelineStatus, exportCsvUrl };
