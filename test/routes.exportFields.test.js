import { describe, it, expect } from 'vitest';
import { parseExportFields, decorateLeadForExport } from '../src/api/routes.js';

describe('parseExportFields', () => {
  it('defaults to phone-only when no fields given', () => {
    expect(parseExportFields(undefined)).toEqual(['phone']);
    expect(parseExportFields('')).toEqual(['phone']);
  });

  it('accepts a comma-separated whitelist', () => {
    expect(parseExportFields('phone,username')).toEqual(['phone', 'username']);
    expect(parseExportFields('phone,username,link')).toEqual(['phone', 'username', 'link']);
  });

  it('always returns fields in canonical order regardless of input order', () => {
    expect(parseExportFields('link,phone,username')).toEqual(['phone', 'username', 'link']);
    expect(parseExportFields('username,link')).toEqual(['username', 'link']);
  });

  it('ignores unknown values and whitespace', () => {
    expect(parseExportFields('phone, bogus , username')).toEqual(['phone', 'username']);
  });

  it('deduplicates repeated fields', () => {
    expect(parseExportFields('phone,phone,username')).toEqual(['phone', 'username']);
  });

  it('falls back to the default when nothing valid remains', () => {
    expect(parseExportFields('bogus,also-bogus')).toEqual(['phone']);
  });

  it('is case-insensitive', () => {
    expect(parseExportFields('PHONE,Username')).toEqual(['phone', 'username']);
  });
});

describe('decorateLeadForExport', () => {
  it('passes phone through as-is', () => {
    const row = decorateLeadForExport({ phone: '+998901234567', contact_username: null, channel_username: null });
    expect(row.phone).toBe('+998901234567');
  });

  it('empty-strings a missing phone rather than null/undefined', () => {
    const row = decorateLeadForExport({ phone: null, contact_username: null, channel_username: null });
    expect(row.phone).toBe('');
  });

  it('prefixes username with @ when present', () => {
    const row = decorateLeadForExport({ phone: null, contact_username: 'shop_admin', channel_username: null });
    expect(row.username).toBe('@shop_admin');
  });

  it('leaves username empty when contact_username is missing', () => {
    const row = decorateLeadForExport({ phone: null, contact_username: null, channel_username: null });
    expect(row.username).toBe('');
  });

  it('builds a t.me link from channel_username', () => {
    const row = decorateLeadForExport({ phone: null, contact_username: null, channel_username: 'my_channel' });
    expect(row.link).toBe('https://t.me/my_channel');
  });

  it('leaves link empty when channel_username is missing', () => {
    const row = decorateLeadForExport({ phone: null, contact_username: null, channel_username: null });
    expect(row.link).toBe('');
  });

  it('works with a Sequelize-style instance exposing toJSON()', () => {
    const fakeInstance = {
      toJSON: () => ({ phone: '+998901234567', contact_username: 'admin', channel_username: 'chan' }),
    };
    const row = decorateLeadForExport(fakeInstance);
    expect(row).toEqual({ phone: '+998901234567', username: '@admin', link: 'https://t.me/chan' });
  });
});
