import sequelize from '../db/index.js';
import { ScanSession, ScanResult } from '../db/models.js';
import { scanChannel } from '../scan/channelScan.js';
import { getPool } from '../telegram/client.js';
import { scanCancellation } from './scanCancellation.js';

/**
 * Bitta kanal/guruhni skanerlaydi. Har chaqiruv o'zining alohida
 * `ScanSession`ini yaratadi va topilgan kontaktlarni shu sessiyaga bog'lab
 * yozadi — turli skanerlashlar natijalari bir-biriga aralashmaydi, har biri
 * mustaqil ko'rish/yuklab olish/o'chirish mumkin bo'lgan "papka" bo'ladi.
 */
export async function runChannelScan({ identifier, dateFromSec, dateToSec, keywords = [] }) {
  await sequelize.authenticate();
  scanCancellation.reset();

  const pool = await getPool();
  const dateFrom = dateFromSec != null ? new Date(dateFromSec * 1000) : null;
  const dateTo = dateToSec != null ? new Date(dateToSec * 1000) : null;
  const keywordsStr = keywords.length > 0 ? keywords.join(', ') : null;

  let outcome;
  try {
    outcome = await scanChannel(pool, { identifier, dateFromSec, dateToSec, keywords });
  } catch (err) {
    if (err.isCancellation) {
      const session = await ScanSession.create({
        source_username: identifier,
        date_from: dateFrom,
        date_to: dateTo,
        keywords: keywordsStr,
        status: 'cancelled',
      });
      return { cancelled: true, scanned: 0, found: 0, hitCap: false, target: null, sessionId: session.id };
    }
    await ScanSession.create({
      source_username: identifier,
      date_from: dateFrom,
      date_to: dateTo,
      keywords: keywordsStr,
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }

  const session = await ScanSession.create({
    source_channel_id: outcome.target.channel_id,
    source_username: outcome.target.username,
    source_title: outcome.target.title,
    source_type: outcome.target.type,
    date_from: dateFrom,
    date_to: dateTo,
    keywords: keywordsStr,
    scanned_count: outcome.scannedMessages,
    found_count: outcome.results.length,
    hit_cap: outcome.hitCap,
    status: 'completed',
  });

  if (outcome.results.length > 0) {
    await ScanResult.bulkCreate(
      outcome.results.map((r) => ({
        scan_session_id: session.id,
        source_channel_id: outcome.target.channel_id,
        source_username: outcome.target.username,
        source_title: outcome.target.title,
        source_type: outcome.target.type,
        contact_type: r.contact_type,
        contact_value: r.contact_value,
        is_bot: r.is_bot,
        message_id: r.message_id,
        message_date: r.message_date,
        message_excerpt: r.message_excerpt,
        matched_keyword: r.matched_keyword,
        match_count: r.match_count,
      }))
    );
  }

  return {
    scanned: outcome.scannedMessages,
    found: outcome.results.length,
    hitCap: outcome.hitCap,
    cancelled: false,
    target: outcome.target,
    sessionId: session.id,
  };
}

export default { runChannelScan };
