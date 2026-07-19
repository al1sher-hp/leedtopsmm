import { Sequelize } from 'sequelize';
import pg from 'pg';
import config from '../config/index.js';

// Vercel'da har so'rov alohida (qisqa umrli) funksiya bo'lishi mumkin — katta
// connection pool Postgres'ning max_connections'ini tugatib qo'yishi mumkin,
// shuning uchun serverless muhitda pool juda kichik tutiladi. Neon/Supabase
// kabi provayderlar odatda SSL talab qiladi (PGSSL=true yoki DATABASE_URL'da
// sslmode=require bo'lsa avtomatik yoqiladi).
const isServerless = Boolean(process.env.VERCEL);
const needsSsl = config.db.url.includes('sslmode=require') || process.env.PGSSL === 'true';

export const sequelize = new Sequelize(config.db.url, {
  dialect: 'postgres',
  // Sequelize `dialect: 'postgres'` satridan kelib chiqib 'pg' paketini
  // DINAMIK require() qiladi — Vercel'ning statik bundler'i (nft) buni
  // ko'ra olmaydi va 'pg'ni funksiya bundle'iga qo'shmay qoladi ("Please
  // install pg package manually" xatosi). `dialectModule` orqali paketni
  // to'g'ridan-to'g'ri (statik import qilingan holda) uzatish shu muammoni
  // butunlay oldini oladi.
  dialectModule: pg,
  logging: false,
  pool: isServerless ? { max: 1, min: 0, idle: 10000, acquire: 20000 } : { max: 5, min: 0, idle: 10000, acquire: 30000 },
  dialectOptions: needsSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
});

export default sequelize;
