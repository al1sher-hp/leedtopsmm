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

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('[migrate] DB ulanishi OK');
    await sequelize.sync({ alter: true });

    for (const indexName of OBSOLETE_INDEXES) {
      await sequelize.query(`DROP INDEX IF EXISTS ${indexName}`);
    }

    console.log('[migrate] Jadval(lar) sinxronlandi');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Xato:', err);
    process.exit(1);
  }
}

migrate();
