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

// ─── Outreach: Telegram akkauntlari ─────────────────────────────────────────
export class TelegramAccount extends Model {}
TelegramAccount.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    session_string: { type: DataTypes.TEXT, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM('active', 'banned', 'limited', 'unverified'),
      allowNull: false,
      defaultValue: 'unverified',
    },
    messages_today: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_reset_at: { type: DataTypes.DATE, allowNull: true },
    daily_limit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 40 },
  },
  { sequelize, modelName: 'TelegramAccount', tableName: 'telegram_accounts' }
);

// ─── Outreach: Kampaniyalar ──────────────────────────────────────────────────
export class Campaign extends Model {}
Campaign.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    message_text: { type: DataTypes.TEXT, allowNull: false },
    message_type: {
      type: DataTypes.ENUM('text', 'image_text', 'video_text'),
      allowNull: false,
      defaultValue: 'text',
    },
    ai_auto_reply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ai_reply_prompt: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('draft', 'running', 'paused', 'completed'),
      allowNull: false,
      defaultValue: 'draft',
    },
    total_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sent_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    replied_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: 'Campaign', tableName: 'campaigns' }
);

// ─── Outreach: Kampaniya maqsadlari ─────────────────────────────────────────
export class CampaignTarget extends Model {}
CampaignTarget.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    campaign_id: { type: DataTypes.INTEGER, allowNull: false },
    contact_type: { type: DataTypes.ENUM('phone', 'username'), allowNull: false },
    contact_value: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'replied'),
      allowNull: false,
      defaultValue: 'pending',
    },
    tg_message_id: { type: DataTypes.BIGINT, allowNull: true },
    tg_peer_id: { type: DataTypes.STRING, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'CampaignTarget',
    tableName: 'campaign_targets',
    indexes: [{ unique: true, fields: ['campaign_id', 'contact_type', 'contact_value'] }],
  }
);

// ─── Outreach: Kampaniyaga kelgan javoblar ───────────────────────────────────
export class CampaignReply extends Model {}
CampaignReply.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    campaign_id: { type: DataTypes.INTEGER, allowNull: false },
    campaign_target_id: { type: DataTypes.INTEGER, allowNull: false },
    from_user_id: { type: DataTypes.STRING, allowNull: true },
    from_username: { type: DataTypes.STRING, allowNull: true },
    message_text: { type: DataTypes.TEXT, allowNull: true },
    tg_message_id: { type: DataTypes.BIGINT, allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: false },
    is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ai_suggested_reply: { type: DataTypes.TEXT, allowNull: true },
    replied: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    replied_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'CampaignReply',
    tableName: 'campaign_replies',
    indexes: [{ unique: true, fields: ['campaign_target_id', 'tg_message_id'] }],
  }
);

// Qo'lda @username orqali telefon qidiruvi natijalari — ScanResult'dan farqli,
// haqiqiy skanerlangan kanal/guruhga bog'liq emas (source_channel_id/source_type
// yo'q), shuning uchun alohida jadval: kanal-skanerlash statistikasi/eksportlariga
// aralashib ketmaydi.
export class PhoneLookup extends Model {}

PhoneLookup.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    contact_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'username',
    },
    contact_value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tg_user_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_bot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Quyidagi ustunlar LookupAudit/DialogContact bilan bir xil "provayder +
    // ishonchlilik" modelini ulash uchun qo'shildi — provider qaysi manba
    // (masalan 'telegram', keyinroq boshqa lookup xizmatlari) natija
    // berganini, confidence esa natija Telegram'ning o'zidan (verified) yoki
    // uchinchi tomon taxminidan (unverified) kelganini bildiradi.
    provider: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    found: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    confidence: {
      type: DataTypes.ENUM('verified', 'unverified'),
      allowNull: true,
    },
    raw_response: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // purgeExpired() (src/lookup/cache.js) muddati o'tgan qatorni O'CHIRMAYDI
    // — faqat nozik maydonlarni (phone/raw_response) tozalab, shu vaqtni
    // qayd etadi. Shunda "bu so'rov qidirilgan edi" fakti tarixda qoladi,
    // raqamning o'zi qolmaydi.
    purged_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'PhoneLookup',
    tableName: 'phone_lookups',
    indexes: [{ fields: ['contact_value'] }, { fields: ['expires_at'] }],
  }
);

// ─── Dialoglar: shaxsiy suhbatdoshlar keshi ─────────────────────────────────
// Userbot'ning barcha shaxsiy dialoglarini (getDialogs) davriy sinxronlash
// natijasi — har bir Telegram foydalanuvchisi uchun bitta qator, ScanResult
// singari "bitta skanerlashga bog'liq" emas, doimiy yangilanib turadigan
// keshdir (shuning uchun scan_session_id kabi bog'lanish yo'q).
export class DialogContact extends Model {}

DialogContact.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tg_user_id: {
      // Unique cheklov faqat pastdagi `indexes`da — sababi models.js
      // boshidagi Lead.channel_id izohida yozilgan (dublikat constraint
      // muammosi).
      type: DataTypes.STRING,
      allowNull: false,
    },
    username: { type: DataTypes.STRING, allowNull: true },
    first_name: { type: DataTypes.STRING, allowNull: true },
    last_name: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    // Telefon qayerdan olinganini bildiradi — 'telegram' (getDialogs/entity
    // ochiq bergan), 'lookup' (PhoneLookup orqali qo'lda qidirilgan) yoki
    // 'manual' (operator qo'lda kiritgan).
    phone_source: {
      type: DataTypes.ENUM('telegram', 'lookup', 'manual'),
      allowNull: true,
    },
    is_bot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_premium: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_contact: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_mutual_contact: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    last_message_at: { type: DataTypes.DATE, allowNull: true },
    message_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    my_message_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    premium_mentions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    classified_at: { type: DataTypes.DATE, allowNull: true },
    // premium_mentions threshold'dan o'tgan, lekin Gemini ikkinchi bosqichda
    // "yo'q, bu odam haqiqatan premium sotib olishga qiziqmagan" degan
    // xulosaga kelgan holatni belgilaydi — premium_mentions O'ZI o'zgarmaydi
    // (kalit so'z hisobi haqiqiy qoladi), faqat shu bayroq true bo'ladi.
    ai_rejected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Foydalanuvchi (dashboard orqali) "menga yozmang" deb belgilagan bo'lsa
    // — bu yozuv o'chirilmaydi (README'dagi "hech bir yozuv o'chirilmaydi"
    // qoidasi), faqat outreach/folder qo'llash bosqichlarida chetlab o'tiladi.
    opted_out: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'DialogContact',
    tableName: 'dialog_contacts',
    indexes: [
      { unique: true, fields: ['tg_user_id'] },
      { fields: ['opted_out'] },
      { fields: ['premium_mentions'] },
      { fields: ['is_premium'] },
    ],
  }
);

// ─── Papkalar: Telegram Folder (Dialog Filter) ko'chirmasi ──────────────────
// Telegram'dagi chat papkalarining lokal aksi. `tg_filter_id` null bo'lishi
// mumkin — papka avval bizning tizimda (rule_json bilan) loyihalashtirilib,
// keyin "Telegram'da yaratish" bosqichida haqiqiy filter'ga aylantiriladi.
export class Folder extends Model {}

Folder.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tg_filter_id: {
      // Unique cheklov faqat pastdagi `indexes`da (Lead.channel_id bilan bir
      // xil sabab). Postgres'da UNIQUE index bir nechta NULL qiymatga
      // to'sqinlik qilmaydi, shuning uchun hali Telegram'da yaratilmagan
      // (tg_filter_id = null) bir nechta papka bemalol yonma-yon turaveradi.
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    emoticon: { type: DataTypes.STRING, allowNull: true },
    peer_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    managed_by_us: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    rule_json: { type: DataTypes.JSONB, allowNull: true },
    last_synced_at: { type: DataTypes.DATE, allowNull: true },
    // applyRule() (src/folders/rules.js) so'nggi qo'llashda hisoblagan
    // overflow sonini shu yerga yozadi — GET /api/folders har safar
    // resolveRule()ni qayta ishga tushirmasdan (N+1) shundan o'qiydi.
    last_overflow_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // So'nggi muvaffaqiyatli qo'llashda ISHLATILGAN qoidaning nusxasi —
    // joriy `rule_json` bilan solishtirib, "qoida qo'llashdan beri
    // o'zgargan (eskirgan natija)" holatini aniqlash uchun.
    last_applied_rule_json: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Folder',
    tableName: 'folders',
    indexes: [{ unique: true, fields: ['tg_filter_id'] }],
  }
);

export class FolderMember extends Model {}

FolderMember.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    folder_id: { type: DataTypes.INTEGER, allowNull: false },
    tg_user_id: { type: DataTypes.STRING, allowNull: false },
    added_at: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    modelName: 'FolderMember',
    tableName: 'folder_members',
    indexes: [{ unique: true, fields: ['folder_id', 'tg_user_id'] }],
  }
);

// ─── Lookup audit: qidiruv so'rovlarining hisobot izi ───────────────────────
// Har bir telefon/username qidiruvi (qo'lda yoki bulk job orqali) shu yerga
// yoziladi — nazorat va suiiste'mol tekshiruvi uchun. To'liq telefon raqami
// bu yerda SAQLANMAYDI, faqat niqoblangan ko'rinishi (masalan +9989****1234) —
// audit jurnali o'zi maxfiy ma'lumot manbaiga aylanib qolmasligi uchun.
export class LookupAudit extends Model {}

LookupAudit.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    query_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'username' },
    query_value: { type: DataTypes.STRING, allowNull: false },
    provider: { type: DataTypes.STRING, allowNull: false },
    found: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // 'api' | 'job:dialogs' | 'job:folders' — so'rov qayerdan kelganini
    // bildiradi (qo'lda API orqalimi yoki fon job orqalimi).
    actor: { type: DataTypes.STRING, allowNull: false },
    purpose: { type: DataTypes.TEXT, allowNull: true },
    result_phone_masked: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    modelName: 'LookupAudit',
    tableName: 'lookup_audits',
    indexes: [{ fields: ['createdAt'] }, { fields: ['provider'] }, { fields: ['query_value'] }],
  }
);

// ─── Job Run: fon vazifalarining umumiy holati ──────────────────────────────
// PipelineRun/ScanSession'ga o'xshash "yugurish" yozuvi, lekin dialoglar
// sinxronizatsiyasi, klassifikatsiya va bulk lookup kabi bir nechta turdagi
// fon vazifasi uchun umumiy — har biriga alohida jadval ochish o'rniga
// `kind` ustuni bilan farqlanadi.
export class JobRun extends Model {}

JobRun.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    kind: {
      type: DataTypes.ENUM('dialogs_sync', 'dialogs_classify', 'lookup_bulk', 'folder_apply'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('running', 'completed', 'cancelled', 'failed'),
      allowNull: false,
      defaultValue: 'running',
    },
    total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    done: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ok_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    params_json: { type: DataTypes.JSONB, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'JobRun',
    tableName: 'job_runs',
    indexes: [{ fields: ['kind'] }, { fields: ['status'] }],
  }
);

// ─── Lookup bulk natijalari: bitta-bitta qo'shiladigan (append-only) ────────
// Avval bulk lookup natijalari JobRun.params_json ichidagi massivga har
// iteratsiyada QAYTA YOZILARDI (O(n^2) — 5000 tagacha so'rov ruxsat etilgani
// uchun bu sezilarli DB yukiga olib kelardi). Endi har natija shu jadvalga
// bitta INSERT bilan (append) qo'shiladi, JobRun esa faqat kichik sanoq
// maydonlarini (done/ok_count/failed_count) yangilaydi.
export class LookupJobResult extends Model {}

LookupJobResult.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    job_id: { type: DataTypes.INTEGER, allowNull: false },
    query: { type: DataTypes.STRING, allowNull: false },
    found: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    phone: { type: DataTypes.STRING, allowNull: true },
    provider: { type: DataTypes.STRING, allowNull: true },
    confidence: { type: DataTypes.ENUM('verified', 'unverified'), allowNull: true },
    first_name: { type: DataTypes.STRING, allowNull: true },
    last_name: { type: DataTypes.STRING, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    error_code: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    modelName: 'LookupJobResult',
    tableName: 'lookup_job_results',
    indexes: [{ fields: ['job_id'] }],
  }
);

export default {
  Lead, BlacklistEntry, ScanSession, ScanResult, PipelineRun, PipelineRunLead,
  TelegramAccount, Campaign, CampaignTarget, CampaignReply, PhoneLookup,
  DialogContact, Folder, FolderMember, LookupAudit, JobRun, LookupJobResult,
};
