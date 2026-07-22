import { DataTypes, Model } from 'sequelize';
import sequelize from './index.js';

export class Lead extends Model {}

Lead.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    channel_title: {
      // TEXT — ba'zi kanal nomlari 255 belgidan uzun bo'lishi mumkin
      // (boyitish shu sababli yiqilmasin).
      type: DataTypes.TEXT,
      allowNull: false,
    },
    channel_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    channel_id: {
      // Unique cheklov FAQAT quyidagi `indexes` massivida e'lon qilinadi —
      // bu yerda ham `unique: true` qo'yish `sync({alter:true})`ni har
      // ishga tushirilganda yangi, boshqa nomli unique constraint qo'shishga
      // majbur qilardi (eskisini "tanimay"), natijada bir xil ustunga
      // o'nlab dublikat constraint yig'ilib qolgan edi.
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('channel', 'group'),
      allowNull: false,
    },
    subs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lang: {
      type: DataTypes.ENUM('uz', 'ru', 'other'),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contact_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contact_type: {
      type: DataTypes.ENUM('phone', 'username', 'both', 'none'),
      allowNull: false,
      defaultValue: 'none',
    },
    contact_is_bot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    matched_keyword: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gemini_score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    segment: {
      type: DataTypes.ENUM('reseller', 'grower', 'other'),
      allowNull: true,
    },
    score_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('new', 'contacted', 'replied', 'client', 'rejected'),
      allowNull: false,
      defaultValue: 'new',
    },
  },
  {
    sequelize,
    modelName: 'Lead',
    tableName: 'leads',
    indexes: [
      { unique: true, fields: ['channel_id'] },
      // Filtr (buildWhere) va saralashda tez-tez ishlatiladigan ustunlar.
      { fields: ['segment'] },
      { fields: ['status'] },
      { fields: ['contact_type'] },
      { fields: ['matched_keyword'] },
      { fields: ['createdAt'] },
    ],
  }
);

export class BlacklistEntry extends Model {}

BlacklistEntry.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    target_type: {
      type: DataTypes.ENUM('channel', 'group', 'bot'),
      allowNull: false,
    },
    target_id: {
      // channel_id'dagi kabi — unique cheklov faqat pastdagi `indexes`da.
      type: DataTypes.STRING,
      allowNull: false,
    },
    target_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    target_title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'active'),
      allowNull: false,
      defaultValue: 'pending',
    },
    // Tasdiqlanishi kutilayotgan amal — 'add' (ro'yxatga qo'shish) yoki
    // 'remove' (olib tashlash). Ikkalasi ham bir xil kod-tavsifga joylashtirish
    // usuli bilan tasdiqlanadi, shuning uchun ustun bitta.
    pending_action: {
      type: DataTypes.ENUM('add', 'remove'),
      allowNull: true,
    },
    verification_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    verification_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'BlacklistEntry',
    tableName: 'blacklist_entries',
    indexes: [{ unique: true, fields: ['target_id'] }],
  }
);

// Bitta skanerlash ishga tushirilishi ("qidiruv") — natijalar shu sessiyaga
// bog'lanadi, shunda turli skanerlashlar bir-biriga aralashib ketmaydi
// (har biri "fayl menejeri"dagi alohida papka kabi ko'rinadi/o'chiriladi).
export class ScanSession extends Model {}

ScanSession.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    source_channel_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source_title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source_type: {
      type: DataTypes.ENUM('channel', 'group'),
      allowNull: true,
    },
    date_from: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    date_to: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    keywords: {
      // TEXT — ko'p kalit so'z birlashtirilganda 255 belgidan oshishi mumkin.
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scanned_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    found_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    hit_cap: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM('completed', 'cancelled', 'failed'),
      allowNull: false,
      defaultValue: 'completed',
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'ScanSession',
    tableName: 'scan_sessions',
  }
);

export class ScanResult extends Model {}

ScanResult.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    scan_session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    source_channel_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    source_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source_title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source_type: {
      type: DataTypes.ENUM('channel', 'group'),
      allowNull: false,
    },
    contact_type: {
      type: DataTypes.ENUM('phone', 'username'),
      allowNull: false,
    },
    contact_value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    is_bot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    message_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    message_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    message_excerpt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    matched_keyword: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    match_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
  },
  {
    sequelize,
    modelName: 'ScanResult',
    tableName: 'scan_results',
    indexes: [{ unique: true, fields: ['scan_session_id', 'contact_type', 'contact_value'] }],
  }
);

// Bitta pipeline ishga tushirilishi ("qidiruv") — Lead'lar bo'limida ham
// ScanSession bilan bir xil "papka" mantig'i. Lead esa mutabil, ko'p marta
// yangilanishi mumkin bo'lgan yagona yozuv bo'lgani uchun (ScanResult'dan
// farqli) natijalar to'g'ridan-to'g'ri emas, PipelineRunLead orqali
// ko'p-ko'pga bog'lanadi — bitta lead bir necha yugurishga tegishli bo'lishi
// mumkin.
export class PipelineRun extends Model {}

PipelineRun.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    keywords: {
      // TEXT — pipeline'ga ko'p kalit so'z berilsa `join(', ')` natijasi
      // 255 belgidan oshib, VARCHAR(255)'da "value too long" xatosiga
      // olib kelardi (pipeline hech boshlanmasdan yiqilardi).
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('running', 'completed', 'cancelled', 'failed'),
      allowNull: false,
      defaultValue: 'running',
    },
    created_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    updated_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    skipped_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failed_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    blacklisted_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'PipelineRun',
    tableName: 'pipeline_runs',
  }
);

export class PipelineRunLead extends Model {}

PipelineRunLead.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    pipeline_run_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.ENUM('created', 'updated'),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'PipelineRunLead',
    tableName: 'pipeline_run_leads',
    indexes: [{ unique: true, fields: ['pipeline_run_id', 'lead_id'] }],
  }
);

export default { Lead, BlacklistEntry, ScanSession, ScanResult, PipelineRun, PipelineRunLead };
