import { QueryTypes } from 'sequelize';
import sequelize from './index.js';

// migrations/0001_group_leads.sql'da yaratilgan jadvallar Sequelize model
// sifatida emas, xom SQL orqali boshqariladi — sxemaning muhim qismi
// (CHECK, BEFORE INSERT trigger, VIEW) Sequelize'ning model-sync mexanizmi
// bilan ifodalanmaydi, shuning uchun DB kirish qatlami ham shu bilan bir xil
// (xom SQL) uslubda saqlanadi.

export async function listSources() {
  return sequelize.query(
    `SELECT s.*, COUNT(gl.id)::int AS lead_count
       FROM lead_sources s
       LEFT JOIN group_leads gl ON gl.source_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC`,
    { type: QueryTypes.SELECT }
  );
}

export async function getActiveSources() {
  return sequelize.query(`SELECT * FROM lead_sources WHERE is_active = true ORDER BY id`, {
    type: QueryTypes.SELECT,
  });
}

export async function getSourceById(id) {
  const rows = await sequelize.query(`SELECT * FROM lead_sources WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return rows[0] || null;
}

export async function createSource({ kind, title, username }) {
  const rows = await sequelize.query(
    `INSERT INTO lead_sources (kind, title, username) VALUES (:kind, :title, :username) RETURNING *`,
    { replacements: { kind, title: title || null, username }, type: QueryTypes.SELECT }
  );
  return rows[0];
}

export async function updateSourceCursor(id, { lastSeenMsg, lastSyncedAt }) {
  await sequelize.query(
    `UPDATE lead_sources SET last_seen_msg = :lastSeenMsg, last_synced_at = :lastSyncedAt WHERE id = :id`,
    { replacements: { id, lastSeenMsg, lastSyncedAt } }
  );
}

/**
 * Bir lead'ni upsert qiladi (ON CONFLICT (phone_e164, source_id) DO
 * NOTHING). `opted_out` qiymati BEFORE INSERT trigger (suppression_list
 * tekshiruvi) tomonidan belgilanadi — bu yerda faqat natija o'qib olinadi.
 */
export async function upsertGroupLead({
  sourceId,
  phoneE164,
  username,
  displayName,
  messageId,
  messageUrl,
  messageText,
  matchedKw,
  postedAt,
}) {
  const rows = await sequelize.query(
    `INSERT INTO group_leads
       (source_id, phone_e164, username, display_name, message_id, message_url, message_text, matched_kw, posted_at)
     VALUES (:sourceId, :phoneE164, :username, :displayName, :messageId, :messageUrl, :messageText, :matchedKw, :postedAt)
     ON CONFLICT (phone_e164, source_id) DO NOTHING
     RETURNING id, opted_out`,
    {
      replacements: {
        sourceId,
        phoneE164,
        username: username || null,
        displayName: displayName || null,
        messageId: messageId ?? null,
        messageUrl: messageUrl || null,
        messageText: messageText || null,
        matchedKw: matchedKw || null,
        postedAt: postedAt || null,
      },
      type: QueryTypes.SELECT,
    }
  );
  if (rows.length === 0) return { inserted: false, optedOut: null };
  return { inserted: true, optedOut: rows[0].opted_out };
}

export async function listGroupLeads({ sourceId, limit = 500 } = {}) {
  const where = sourceId ? 'WHERE gl.source_id = :sourceId' : '';
  return sequelize.query(
    `SELECT gl.*, s.title AS source_title, s.username AS source_username, s.kind AS source_kind
       FROM group_leads gl
       JOIN lead_sources s ON s.id = gl.source_id
       ${where}
      ORDER BY gl.collected_at DESC
      LIMIT :limit`,
    { replacements: { sourceId: sourceId || null, limit }, type: QueryTypes.SELECT }
  );
}

export async function listExportableLeads() {
  return sequelize.query(`SELECT * FROM exportable_leads ORDER BY collected_at DESC`, {
    type: QueryTypes.SELECT,
  });
}

export async function countTotalLeads() {
  const rows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM group_leads`, {
    type: QueryTypes.SELECT,
  });
  return rows[0].count;
}

export async function countActiveSources() {
  const rows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM lead_sources WHERE is_active = true`, {
    type: QueryTypes.SELECT,
  });
  return rows[0].count;
}

export async function countExportableLeads() {
  const rows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM exportable_leads`, {
    type: QueryTypes.SELECT,
  });
  return rows[0].count;
}

export async function recordExportBatch({ rowCount, hashed }) {
  await sequelize.query(`INSERT INTO export_batches (row_count, hashed) VALUES (:rowCount, :hashed)`, {
    replacements: { rowCount, hashed },
  });
}

export default {
  listSources,
  getActiveSources,
  getSourceById,
  createSource,
  updateSourceCursor,
  upsertGroupLead,
  listGroupLeads,
  listExportableLeads,
  countTotalLeads,
  countActiveSources,
  countExportableLeads,
  recordExportBatch,
};
