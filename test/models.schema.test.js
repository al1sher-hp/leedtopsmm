import { describe, it, expect } from 'vitest';
import {
  DialogContact, Folder, FolderMember, LookupAudit, JobRun, PhoneLookup,
} from '../src/db/models.js';

// Bu test HAQIQIY DB'ga ulanmaydi — sequelize.sync()/authenticate() emas,
// faqat Model.init() natijasida saqlanadigan metadata (rawAttributes,
// options.indexes) tekshiriladi. Shu tarzda modellar CI'da Postgres'siz ham
// tasdiqlanadi.

function attrNames(model) {
  return Object.keys(model.rawAttributes);
}

function indexFieldSets(model) {
  return (model.options.indexes || []).map((idx) => ({
    unique: !!idx.unique,
    fields: idx.fields.slice().sort(),
  }));
}

function hasIndex(model, fields, unique) {
  const target = { unique, fields: fields.slice().sort() };
  return indexFieldSets(model).some(
    (idx) => idx.unique === target.unique && JSON.stringify(idx.fields) === JSON.stringify(target.fields)
  );
}

describe('DialogContact', () => {
  it('tableName va majburiy ustunlarga ega', () => {
    expect(DialogContact.getTableName()).toBe('dialog_contacts');
    const attrs = attrNames(DialogContact);
    for (const col of [
      'tg_user_id', 'username', 'first_name', 'last_name', 'phone', 'phone_source',
      'is_bot', 'is_premium', 'is_contact', 'is_mutual_contact', 'last_message_at',
      'message_count', 'my_message_count', 'premium_mentions', 'classified_at', 'opted_out', 'ai_rejected',
    ]) {
      expect(attrs).toContain(col);
    }
  });

  it('tg_user_id notNull', () => {
    expect(DialogContact.rawAttributes.tg_user_id.allowNull).toBe(false);
  });

  it('BOOLEAN ustunlar notNull va default false', () => {
    for (const col of ['is_bot', 'is_premium', 'is_contact', 'is_mutual_contact', 'opted_out', 'ai_rejected']) {
      expect(DialogContact.rawAttributes[col].allowNull).toBe(false);
      expect(DialogContact.rawAttributes[col].defaultValue).toBe(false);
    }
  });

  it('tg_user_id bo\'yicha unique index bor', () => {
    expect(hasIndex(DialogContact, ['tg_user_id'], true)).toBe(true);
  });

  it('opted_out, premium_mentions, is_premium bo\'yicha oddiy index bor', () => {
    expect(hasIndex(DialogContact, ['opted_out'], false)).toBe(true);
    expect(hasIndex(DialogContact, ['premium_mentions'], false)).toBe(true);
    expect(hasIndex(DialogContact, ['is_premium'], false)).toBe(true);
  });

  it('tg_user_id ustunida field-darajasidagi unique:true yo\'q (dublikat constraint muammosining oldini olish uchun)', () => {
    expect(DialogContact.rawAttributes.tg_user_id.unique).toBeFalsy();
  });
});

describe('Folder', () => {
  it('tableName va majburiy ustunlarga ega', () => {
    expect(Folder.getTableName()).toBe('folders');
    const attrs = attrNames(Folder);
    for (const col of [
      'tg_filter_id', 'title', 'emoticon', 'peer_count', 'managed_by_us', 'rule_json', 'last_synced_at',
    ]) {
      expect(attrs).toContain(col);
    }
  });

  it('title notNull, tg_filter_id null bo\'lishi mumkin', () => {
    expect(Folder.rawAttributes.title.allowNull).toBe(false);
    expect(Folder.rawAttributes.tg_filter_id.allowNull).toBe(true);
  });

  it('peer_count default 0, managed_by_us default false', () => {
    expect(Folder.rawAttributes.peer_count.defaultValue).toBe(0);
    expect(Folder.rawAttributes.managed_by_us.defaultValue).toBe(false);
  });

  it('tg_filter_id bo\'yicha unique index bor', () => {
    expect(hasIndex(Folder, ['tg_filter_id'], true)).toBe(true);
  });

  it('tg_filter_id ustunida field-darajasidagi unique:true yo\'q', () => {
    expect(Folder.rawAttributes.tg_filter_id.unique).toBeFalsy();
  });
});

describe('FolderMember', () => {
  it('tableName va majburiy ustunlarga ega', () => {
    expect(FolderMember.getTableName()).toBe('folder_members');
    const attrs = attrNames(FolderMember);
    for (const col of ['folder_id', 'tg_user_id', 'added_at']) {
      expect(attrs).toContain(col);
    }
  });

  it('folder_id, tg_user_id, added_at notNull', () => {
    expect(FolderMember.rawAttributes.folder_id.allowNull).toBe(false);
    expect(FolderMember.rawAttributes.tg_user_id.allowNull).toBe(false);
    expect(FolderMember.rawAttributes.added_at.allowNull).toBe(false);
  });

  it('(folder_id, tg_user_id) bo\'yicha unique index bor', () => {
    expect(hasIndex(FolderMember, ['folder_id', 'tg_user_id'], true)).toBe(true);
  });
});

describe('LookupAudit', () => {
  it('tableName va majburiy ustunlarga ega', () => {
    expect(LookupAudit.getTableName()).toBe('lookup_audits');
    const attrs = attrNames(LookupAudit);
    for (const col of [
      'query_type', 'query_value', 'provider', 'found', 'actor', 'purpose', 'result_phone_masked',
    ]) {
      expect(attrs).toContain(col);
    }
  });

  it('query_type default "username", found default false', () => {
    expect(LookupAudit.rawAttributes.query_type.defaultValue).toBe('username');
    expect(LookupAudit.rawAttributes.found.defaultValue).toBe(false);
  });

  it('query_value, provider, actor notNull', () => {
    expect(LookupAudit.rawAttributes.query_value.allowNull).toBe(false);
    expect(LookupAudit.rawAttributes.provider.allowNull).toBe(false);
    expect(LookupAudit.rawAttributes.actor.allowNull).toBe(false);
  });

  it('createdAt, provider, query_value bo\'yicha index bor', () => {
    expect(hasIndex(LookupAudit, ['createdAt'], false)).toBe(true);
    expect(hasIndex(LookupAudit, ['provider'], false)).toBe(true);
    expect(hasIndex(LookupAudit, ['query_value'], false)).toBe(true);
  });

  it('to\'liq telefon raqami uchun ustun yo\'q — faqat niqoblangan variant', () => {
    expect(attrNames(LookupAudit)).not.toContain('result_phone');
    expect(attrNames(LookupAudit)).not.toContain('phone');
  });
});

describe('JobRun', () => {
  it('tableName va majburiy ustunlarga ega', () => {
    expect(JobRun.getTableName()).toBe('job_runs');
    const attrs = attrNames(JobRun);
    for (const col of [
      'kind', 'status', 'total', 'done', 'ok_count', 'failed_count', 'params_json', 'error_message',
    ]) {
      expect(attrs).toContain(col);
    }
  });

  it('kind notNull, ENUM qiymatlari to\'g\'ri', () => {
    expect(JobRun.rawAttributes.kind.allowNull).toBe(false);
    expect(JobRun.rawAttributes.kind.values).toEqual([
      'dialogs_sync', 'dialogs_classify', 'lookup_bulk', 'folder_apply',
    ]);
  });

  it('status default "running"', () => {
    expect(JobRun.rawAttributes.status.defaultValue).toBe('running');
  });

  it('sanoq ustunlari (total/done/ok_count/failed_count) default 0', () => {
    for (const col of ['total', 'done', 'ok_count', 'failed_count']) {
      expect(JobRun.rawAttributes[col].defaultValue).toBe(0);
    }
  });

  it('kind va status bo\'yicha index bor', () => {
    expect(hasIndex(JobRun, ['kind'], false)).toBe(true);
    expect(hasIndex(JobRun, ['status'], false)).toBe(true);
  });
});

describe('PhoneLookup (kengaytirilgan ustunlar)', () => {
  it('yangi ustunlar mavjud, eskilari saqlanib qolgan', () => {
    const attrs = attrNames(PhoneLookup);
    for (const col of ['contact_type', 'contact_value', 'phone', 'tg_user_id', 'first_name', 'last_name', 'is_bot']) {
      expect(attrs).toContain(col); // eski ustunlar
    }
    for (const col of ['provider', 'found', 'confidence', 'raw_response', 'source_note', 'expires_at']) {
      expect(attrs).toContain(col); // yangi ustunlar
    }
  });

  it('found default false, confidence faqat verified/unverified', () => {
    expect(PhoneLookup.rawAttributes.found.defaultValue).toBe(false);
    expect(PhoneLookup.rawAttributes.confidence.values).toEqual(['verified', 'unverified']);
  });

  it('contact_value va expires_at bo\'yicha index bor', () => {
    expect(hasIndex(PhoneLookup, ['contact_value'], false)).toBe(true);
    expect(hasIndex(PhoneLookup, ['expires_at'], false)).toBe(true);
  });
});
