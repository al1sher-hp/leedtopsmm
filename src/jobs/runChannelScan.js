import sequelize from '../db/index.js';
import { ScanResult } from '../db/models.js';
import { scanChannel } from '../scan/channelScan.js';
import { getPool } from '../telegram/client.js';
import { scanCancellation } from './scanCancellation.js';

/**
 * Bitta kanal/guruhni skanerlaydi va topilgan kontaktlarni saqlaydi
 * (source_channel_id + contact_type + contact_value bo'yicha upsert —
 * qayta skanerlashda dublikat qator yaratilmaydi, match_count oshadi).
 */
export async function runChannelScan({ identifier, dateFromSec, dateToSec, keywords = [] }) {
  await sequelize.authenticate();
  scanCancellation.reset();

  const pool = await getPool();

  let outcome;
  try {
    outcome = await scanChannel(pool, { identifier, dateFromSec, dateToSec, keywords });
  } catch (err) {
    if (err.isCancellation) {
      return { cancelled: true, scanned: 0, found: 0, created: 0, updated: 0, hitCap: false, target: null };
    }
    throw err;
  }

  const stats = {
    scanned: outcome.scannedMessages,
    found: outcome.results.length,
    created: 0,
    updated: 0,
    hitCap: outcome.hitCap,
    cancelled: false,
    target: outcome.target,
  };

  for (const r of outcome.results) {
    const [row, created] = await ScanResult.findOrCreate({
      where: {
        source_channel_id: outcome.target.channel_id,
        contact_type: r.contact_type,
        contact_value: r.contact_value,
      },
      defaults: {
        source_username: outcome.target.username,
        source_title: outcome.target.title,
        source_type: outcome.target.type,
        is_bot: r.is_bot,
        message_date: r.message_date,
        message_excerpt: r.message_excerpt,
        matched_keyword: r.matched_keyword,
        match_count: r.match_count,
      },
    });

    if (created) {
      stats.created += 1;
    } else {
      await row.update({
        source_username: outcome.target.username,
        source_title: outcome.target.title,
        message_date: r.message_date,
        message_excerpt: r.message_excerpt,
        matched_keyword: r.matched_keyword ?? row.matched_keyword,
        match_count: row.match_count + r.match_count,
      });
      stats.updated += 1;
    }
  }

  return stats;
}

export default { runChannelScan };
