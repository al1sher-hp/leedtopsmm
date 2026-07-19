import sequelize from './index.js';
import './models.js';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('[migrate] DB ulanishi OK');
    await sequelize.sync({ alter: true });
    console.log('[migrate] Jadval(lar) sinxronlandi: leads');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Xato:', err);
    process.exit(1);
  }
}

migrate();
