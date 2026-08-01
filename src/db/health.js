import { QueryTypes } from 'sequelize';
import sequelize from './index.js';

// Kutilayotgan jadvallar ro'yxati DINAMIK — sequelize.models'dan olinadi,
// qo'lda yozilmaydi. Sabab: production'da 5 ta jadval yetishmagani bir necha
// kun sezilmadi, chunki hech kim /health'ni yangi model qo'shilganda
// yangilashni eslamadi. Dinamik ro'yxat bilan bu butunlay imkonsiz —
// models.js'ga yangi model qo'shilishi bilanoq /health ham uni biladi.
function expectedTables() {
  return Array.from(new Set(Object.values(sequelize.models).map((m) => m.getTableName())));
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
