import { describe, it, expect } from 'vitest';
import { parseIdentifier, generateVerificationCode } from '../src/blacklist/blacklist.js';

describe('parseIdentifier', () => {
  it('accepts a plain @username', () => {
    expect(parseIdentifier('@my_channel')).toBe('my_channel');
  });

  it('accepts a bare username without @', () => {
    expect(parseIdentifier('my_channel')).toBe('my_channel');
  });

  it('strips a t.me link', () => {
    expect(parseIdentifier('https://t.me/my_channel')).toBe('my_channel');
    expect(parseIdentifier('http://www.t.me/my_channel')).toBe('my_channel');
    expect(parseIdentifier('t.me/my_channel')).toBe('my_channel');
  });

  it('strips trailing path/query segments', () => {
    expect(parseIdentifier('https://t.me/my_channel/123?x=1')).toBe('my_channel');
  });

  it('rejects invite links (not resolvable by username)', () => {
    expect(parseIdentifier('https://t.me/+AbCdEf12345')).toBeNull();
  });

  it('rejects usernames that are too short or malformed', () => {
    expect(parseIdentifier('abc')).toBeNull();
    expect(parseIdentifier('1abcde')).toBeNull();
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier(null)).toBeNull();
  });
});

describe('generateVerificationCode', () => {
  it('produces a unique, prefixed code each time', () => {
    const a = generateVerificationCode();
    const b = generateVerificationCode();
    expect(a).toMatch(/^TSMM-[0-9A-F]{10}$/);
    expect(a).not.toBe(b);
  });
});
