import { QueryTypes } from 'sequelize';
import sequelize from './index.js';

// `group_leads` migratsiyasi (migrations/0001_*.sql, 0002_*.sql) xom SQL
// orqali yaratiladi — Sequelize modeli emas, shuning uchun sequelize.models
// ro'yxatida ko'rinmaydi va bu yerda qo'lda qo'shiladi.
const RAW_SQL_TABLES = ['lead_sources', 'group_leads', 'suppression_list', 'export_batches', 'pipeline_keywords'];

// Ilova ISHLASHI uchun kutilgan barcha jadvallar: Sequelize
// modellaridan (dinamik — models.js qayerdan import qilinishidan qat'i
// nazar sequelize.models orqali) + xom SQL migratsiyalaridagi jadvallar.
function expectedTables() {
  const modelTables = Object.values(sequelize.models).map((m) => m.getTableName());
  return Array.from(new Set([...modelTables, ...RAW_SQL_TABLES]));
}

/**
 * DB'da haqiqatda mavjud jadvallarni kutilgan ro'yxat bilan solishtiradi.
 * Bu aynan "relation ... does not exist" xatosining sababini — `npm run
 * migrate` boshqa DATABASE_URL'ga qarshi ishga tushirilgan (yoki umuman
 * ishga tushirilmagan) holatni — aniq ko'rsatish uchun (qarang: /health).
 * Xato tashlamaydi (masalan DB ulanmasa) — chaqiruvchi shuni o'zi ushlaydi.
 */
export async function checkRequiredTables() {
  const expected = expectedTables();
  // Eslatma: `information_schema.tables` shu Sequelize+pg birikmasida
  // qatorlarni ob'ekt (`{table_name: ...}`) o'rniga massiv sifatida
  // qaytaradi (tekshirib ko'rilgan — pg_catalog.pg_tables muammosiz) —
  // shuning uchun ataylab shu view emas, standart katalog ishlatiladi.
  const rows = await sequelize.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`,
    { type: QueryTypes.SELECT }
  );
  const existing = new Set(rows.map((r) => r.tablename));
  const missing = expected.filter((t) => !existing.has(t));
  return { ok: missing.length === 0, expectedCount: expected.length, missing };
}

export default { checkRequiredTables };
