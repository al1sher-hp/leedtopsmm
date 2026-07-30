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

export function exportScanSessionXlsxUrl(id) {
  return `${API_URL}/api/scan/sessions/${id}/export.xlsx`;
}

// Guruh/kanal a'zolarini XLSX faylga eksport qilish.
// Javob to'g'ridan-to'g'ri .xlsx blob — fetch + download trigger kerak.
export async function exportParticipants(identifier) {
  const baseUrl = PIPELINE_API_URL;
  const res = await fetch(`${baseUrl}/api/scan/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `So'rov xatosi: ${res.status}`);
  }
  // Blob qaytaramiz — chaqiruvchi tomonida download trigger qilinadi
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `group-users.xlsx`;
  return { blob, filename };
}

// ─── Outreach: Akkountlar ─────────────────────────────────────────────────────
export function fetchAccounts() {
  return request('/api/outreach/accounts', {}, PIPELINE_API_URL);
}
export function addAccount(data) {
  return request('/api/outreach/accounts', { method: 'POST', body: JSON.stringify(data) }, PIPELINE_API_URL);
}
export function verifyAccount(id) {
  return request(`/api/outreach/accounts/${id}/verify`, { method: 'POST' }, PIPELINE_API_URL);
}
export function updateAccount(id, data) {
  return request(`/api/outreach/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, PIPELINE_API_URL);
}
export function deleteAccount(id) {
  return request(`/api/outreach/accounts/${id}`, { method: 'DELETE' }, PIPELINE_API_URL);
}

// ─── Outreach: Kampaniyalar ───────────────────────────────────────────────────
export function fetchCampaigns() {
  return request('/api/outreach/campaigns', {}, PIPELINE_API_URL);
}
export function fetchCampaign(id) {
  return request(`/api/outreach/campaigns/${id}`, {}, PIPELINE_API_URL);
}
export function createCampaign(data) {
  return request('/api/outreach/campaigns', { method: 'POST', body: JSON.stringify(data) }, PIPELINE_API_URL);
}
export function updateCampaign(id, data) {
  return request(`/api/outreach/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, PIPELINE_API_URL);
}
export function deleteCampaign(id) {
  return request(`/api/outreach/campaigns/${id}`, { method: 'DELETE' }, PIPELINE_API_URL);
}
export function startCampaign(id) {
  return request(`/api/outreach/campaigns/${id}/start`, { method: 'POST' }, PIPELINE_API_URL);
}
export function pauseCampaign(id) {
  return request(`/api/outreach/campaigns/${id}/pause`, { method: 'POST' }, PIPELINE_API_URL);
}
export function addTargets(campaignId, data) {
  return request(`/api/outreach/campaigns/${campaignId}/targets`, { method: 'POST', body: JSON.stringify(data) }, PIPELINE_API_URL);
}
export function fetchTargets(campaignId, params = {}) {
  const q = new URLSearchParams(cleanParams(params)).toString();
  return request(`/api/outreach/campaigns/${campaignId}/targets${q ? `?${q}` : ''}`, {}, PIPELINE_API_URL);
}
export function fetchReplies(campaignId, params = {}) {
  const q = new URLSearchParams(cleanParams(params)).toString();
  return request(`/api/outreach/campaigns/${campaignId}/replies${q ? `?${q}` : ''}`, {}, PIPELINE_API_URL);
}
export function markReplyRead(campaignId, replyId) {
  return request(`/api/outreach/campaigns/${campaignId}/replies/${replyId}/read`, { method: 'PATCH' }, PIPELINE_API_URL);
}
export function respondToReply(campaignId, replyId, text) {
  return request(`/api/outreach/campaigns/${campaignId}/replies/${replyId}/respond`, { method: 'POST', body: JSON.stringify({ text }) }, PIPELINE_API_URL);
}
export function triggerInboxCheck(campaignId) {
  return request(`/api/outreach/campaigns/${campaignId}/check-replies`, { method: 'POST' }, PIPELINE_API_URL);
}
export function fetchWorkerStatus() {
  return request('/api/outreach/worker', {}, PIPELINE_API_URL);
}

// ─── Nomer qidirish ───────────────────────────────────────────────────────────
export function lookupPhone(username) {
  return request('/api/outreach/lookup-phone', {
    method: 'POST',
    body: JSON.stringify({ username }),
  }, PIPELINE_API_URL);
}

export function lookupPhoneBulk(usernames) {
  return request('/api/outreach/lookup-phone-bulk', {
    method: 'POST',
    body: JSON.stringify({ usernames }),
  }, PIPELINE_API_URL);
}

// ─── Akkount yaratish wizard ───────────────────────────────────────────────────
export function wizardStart(phone) {
  return request('/api/outreach/accounts/create/start', { method: 'POST', body: JSON.stringify({ phone }) }, PIPELINE_API_URL);
}
export function wizardConfirm(session_id, code) {
  return request('/api/outreach/accounts/create/confirm', { method: 'POST', body: JSON.stringify({ session_id, code }) }, PIPELINE_API_URL);
}
export function wizardTwoFA(session_id, password) {
  return request('/api/outreach/accounts/create/2fa', { method: 'POST', body: JSON.stringify({ session_id, password }) }, PIPELINE_API_URL);
}

// ─── Jildlar (Telegram Dialog Filter) ─────────────────────────────────────────
// Ro'yxat/a'zolar/eksport DB'dan o'qiladi (tez API host'i), yaratish/qo'llash/
// sinxronlash/o'chirish esa jonli Telegram ulanishi (getPool()) talab qiladi —
// pipeline/scan bilan bir xil sababga ko'ra doim-ishlaydigan hostga yuboriladi.
export function fetchFolders() {
  return request('/api/folders');
}

export function createFolder(data) {
  return request('/api/folders', { method: 'POST', body: JSON.stringify(data) }, PIPELINE_API_URL);
}

export function applyFolderRule(id) {
  return request(`/api/folders/${id}/apply`, { method: 'POST' }, PIPELINE_API_URL);
}

export function fetchFolderJob(jobId) {
  return request(`/api/folders/jobs/${jobId}`);
}

export function syncFolder(id) {
  return request(`/api/folders/${id}/sync`, { method: 'POST' }, PIPELINE_API_URL);
}

export function fetchFolderMembers(id, params = {}) {
  const q = new URLSearchParams(cleanParams(params)).toString();
  return request(`/api/folders/${id}/members${q ? `?${q}` : ''}`);
}

export function exportFolderXlsxUrl(id) {
  return `${API_URL}/api/folders/${id}/export.xlsx`;
}

export function deleteFolderEntry(id) {
  return request(`/api/folders/${id}`, { method: 'DELETE' }, PIPELINE_API_URL);
}

// ─── Dialoglar (lichka kontaktlari) ───────────────────────────────────────────
// Ro'yxat/eksport/opted_out DB'dan o'qiladi (tez API host'i), sinxronlash esa
// jonli Telegram ulanishi (getPool()) talab qiladi — pipeline/scan bilan bir
// xil sababga ko'ra doim-ishlaydigan hostga yuboriladi.
export function fetchDialogs(params = {}) {
  const q = new URLSearchParams(cleanParams(params)).toString();
  return request(`/api/dialogs${q ? `?${q}` : ''}`);
}

export function updateDialogOptedOut(id, opted_out) {
  return request(`/api/dialogs/${id}`, { method: 'PATCH', body: JSON.stringify({ opted_out }) });
}

export function exportDialogsXlsxUrl(params = {}) {
  const q = new URLSearchParams(cleanParams(params)).toString();
  return `${API_URL}/api/dialogs/export.xlsx${q ? `?${q}` : ''}`;
}

export function runDialogsSync(data = {}) {
  return request('/api/dialogs/sync', { method: 'POST', body: JSON.stringify(data) }, PIPELINE_API_URL);
}

export function cancelDialogsSync() {
  return request('/api/dialogs/sync/cancel', { method: 'POST' }, PIPELINE_API_URL);
}

export function fetchDialogsSyncStatus() {
  return request('/api/dialogs/sync/status', {}, PIPELINE_API_URL);
}

// Premium'ga qiziqish tahlili — Telegram (GetHistory) + ixtiyoriy Gemini
// tekshiruvi talab qiladi, shuning uchun sync bilan bir xil doim-ishlaydigan
// hostga yuboriladi.
export function runDialogsClassify(data = {}) {
  return request('/api/dialogs/classify', { method: 'POST', body: JSON.stringify(data) }, PIPELINE_API_URL);
}

export function cancelDialogsClassify() {
  return request('/api/dialogs/classify/cancel', { method: 'POST' }, PIPELINE_API_URL);
}

export function fetchDialogsClassifyStatus() {
  return request('/api/dialogs/classify/status', {}, PIPELINE_API_URL);
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
  exportScanSessionXlsxUrl,
  exportParticipants,
  promoteSessionToLead,
  fetchFolders,
  createFolder,
  applyFolderRule,
  fetchFolderJob,
  syncFolder,
  fetchFolderMembers,
  exportFolderXlsxUrl,
  deleteFolderEntry,
  fetchDialogs,
  updateDialogOptedOut,
  exportDialogsXlsxUrl,
  runDialogsSync,
  cancelDialogsSync,
  fetchDialogsSyncStatus,
  runDialogsClassify,
  cancelDialogsClassify,
  fetchDialogsClassifyStatus,
};
