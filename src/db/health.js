import { QueryTypes } from 'sequelize';
import sequelize from './index.js';

// `group_leads` moduli (migrations/0001_group_leads.sql, 0002_*.sql) xom SQL
// orqali yaratiladi — Sequelize modeli emas, shuning uchun sequelize.models
// ro'yxatida ko'rinmaydi va bu yerda qo'lda qo'shiladi.
const RAW_SQL_TABLES = ['lead_sources', 'group_leads', 'suppression_list', 'export_batches', 'pipeline_keywords'];

// Kutilayotgan jadvallar ro'yxati (Sequelize modellari qismi) DINAMIK —
// sequelize.models'dan olinadi, qo'lda yozilmaydi. Sabab: production'da 5 ta
// jadval yetishmagani bir necha kun sezilmadi, chunki hech kim /health'ni
// yangi model qo'shilganda yangilashni eslamadi. Dinamik ro'yxat bilan bu
// butunlay imkonsiz — models.js'ga yangi model qo'shilishi bilanoq /health
// ham uni biladi. Xom SQL jadvallar (yuqorida) bunga kirmaydi — ular alohida
// qo'shiladi.
function expectedTables() {
  const modelTables = Object.values(sequelize.models).map((m) => m.getTableName());
  return Array.from(new Set([...modelTables, ...RAW_SQL_TABLES]));
}

/**
 * DB ulanishi VA sxema (kutilgan jadvallar) holatini bitta so'rovda
 * tekshiradi. Oldingi /health faqat ulanishni bilardi ("ok" derdi), jadval
 * yetishmasa ham — shu tufayli UI xatoni "bo'sh ro'yxat" deb ko'rsatgan,
 * muammo kunlarcha sezilmagan. `pg_catalog.pg_tables` ataylab ishlatiladi
 * (information_schema.tables emas) — Sequelize+pg birikmasida shu view
 * qatorlarni obyekt emas, massiv sifatida to'g'ri qaytaradi.
 *
 * @returns {Promise<{ok: boolean, db: boolean, tables: {expected: string[], missing: string[]}, migrationsNeeded: boolean}>}
 */
export async function checkHealth() {
  const expected = expectedTables();

  let rows;
  try {
    rows = await sequelize.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`, {
      type: QueryTypes.SELECT,
    });
  } catch (err) {
    // DB'ga umuman ulanib bo'lmadi — sxema haqida hech narsa deya olmaymiz,
    // faqat ulanish o'zi yiqilganini bildiramiz.
    return {
      ok: false,
      db: false,
      tables: { expected, missing: [] },
      migrationsNeeded: false,
    };
  }

  const existing = new Set(rows.map((r) => r.tablename));
  const missing = expected.filter((t) => !existing.has(t));

  return {
    ok: missing.length === 0,
    db: true,
    tables: { expected, missing },
    migrationsNeeded: missing.length > 0,
  };
}

export default { checkHealth };
