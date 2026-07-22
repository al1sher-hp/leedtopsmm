import sequelize from './index.js';
import './models.js';

// sync({ alter: true }) modeldagi yangi ustun/jadval/indexlarni qo'shadi,
// lekin modelda endi yo'q bo'lgan ESKI indexlarni o'zi olib tashlamaydi —
// shuning uchun eskirgan indexlar shu yerda qo'lda tozalanadi (IF EXISTS —
// qayta ishga tushirish xavfsiz).
const OBSOLETE_INDEXES = [
  // scan_results endi (scan_session_id, contact_type, contact_value) bo'yicha
  // unique — eski (source_channel_id, ...) indexi turli skanerlash
  // sessiyalarida bir xil kontakt qayta topilishini bloklab qo'yardi.
  'scan_results_source_channel_id_contact_type_contact_value',
];

// `q` bo'yicha qidiruv ILIKE '%...%' ishlatadi — oddiy B-tree index bunga
// yordam bermaydi, pg_trgm'ning GIN indexi esa qism-satr qidiruvini
// tezlashtiradi. Ba'zi cheklangan managed Postgres provayderlarida
// CREATE EXTENSION huquqi bo'lmasligi mumkin — shu holda ogohlantirib,
// migratsiyaning qolganini davom ettiramiz (bu — ixtiyoriy optimallashtirish,
// bo'lmasa ham tizim ishlayveradi, faqat qidiruv sekinroq bo'ladi).
const TRGM_COLUMNS = ['channel_title', 'channel_username', 'contact_username', 'description'];

// Sequelize'da bir ustunga HAM field-darajasidagi `unique: true`, HAM
// alohida `indexes` yozuvi bo'lsa, `sync({alter:true})` har ishga
// tushirilganda eski constraint'ni "tanimay" yangi (avtomatik "_key",
// "_key1", ... nomli) unique constraint qo'shib boraveradi — natijada
// bitta ustunda o'nlab dublikat constraint yig'ilib qolishi mumkin edi
// (`leads.channel_id`, `blacklist_entries.target_id`). Model'dagi
// dublikat `unique: true` allaqachon olib tashlangan (bu takrorlanishning
// oldini oladi), lekin ALLAQACHON yig'ilib qolgan dublikatlarni bu yerda
// dinamik tarzda (aniq sonini bilmasdan ham) tozalaymiz.
async function dropDuplicateUniqueConstraints(table, column) {
  // Naqsh (LIKE '..._key%') Sequelize'ning auto-generatsiya qilingan
  // dublikat nomlariga mos keladi, kanonik indexga ("<table>_<column>",
  // "_key" qo'shimchasiz) esa mos kelmaydi — shuning uchun uni alohida
  // istisno qilish shart emas.
  const [rows] = await sequelize.query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = '${table}'::regclass AND contype = 'u' AND conname LIKE '${table}_${column}_key%'`
  );
  for (const { conname } of rows) {
    await sequelize.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${conname}"`);
  }
  if (rows.length > 0) {
    console.log(`[migrate] ${table}.${column}: ${rows.length} ta dublikat unique constraint tozalandi`);
  }
}

async function setupTrigramSearch() {
  try {
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    for (const col of TRGM_COLUMNS) {
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS leads_${col}_trgm_idx ON leads USING GIN (${col} gin_trgm_ops)`
      );
    }
    console.log('[migrate] pg_trgm GIN indexlari tayyor');
  } catch (err) {
    console.warn(
      `[migrate] pg_trgm indexini o'rnatib bo'lmadi (huquq yetishmasligi mumkin) — davom etilmoqda: ${err.message}`
    );
  }
}

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('[migrate] DB ulanishi OK');
    await sequelize.sync({ alter: true });

    for (const indexName of OBSOLETE_INDEXES) {
      await sequelize.query(`DROP INDEX IF EXISTS ${indexName}`);
    }

    await dropDuplicateUniqueConstraints('leads', 'channel_id');
    await dropDuplicateUniqueConstraints('blacklist_entries', 'target_id');

    await setupTrigramSearch();

    console.log('[migrate] Jadval(lar) sinxronlandi');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Xato:', err);
    process.exit(1);
  }
}

migrate();
