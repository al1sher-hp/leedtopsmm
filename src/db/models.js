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
      type: DataTypes.STRING,
      allowNull: false,
    },
    channel_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    channel_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
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
    indexes: [{ unique: true, fields: ['channel_id'] }],
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
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
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

export default { Lead, BlacklistEntry };
