import { describe, it, expect } from 'vitest';
import { sanitizeUsername } from '../src/lib/sources/username.js';

describe('sanitizeUsername', () => {
  it('strips a leading @', () => {
    expect(sanitizeUsername('@elonlar_kanali')).toBe('elonlar_kanali');
  });

  it('strips an https://t.me/ prefix', () => {
    expect(sanitizeUsername('https://t.me/elonlar_kanali')).toBe('elonlar_kanali');
  });

  it('strips a t.me/ prefix without protocol', () => {
    expect(sanitizeUsername('t.me/elonlar_kanali')).toBe('elonlar_kanali');
  });

  it('strips a telegram.me/ prefix', () => {
    expect(sanitizeUsername('http://telegram.me/elonlar_kanali')).toBe('elonlar_kanali');
  });

  it('drops trailing path/query segments', () => {
    expect(sanitizeUsername('https://t.me/elonlar_kanali/425?comments_limit=100')).toBe('elonlar_kanali');
  });

  it('passes through a bare username unchanged', () => {
    expect(sanitizeUsername('elonlar_kanali')).toBe('elonlar_kanali');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeUsername('  elonlar_kanali  ')).toBe('elonlar_kanali');
  });

  it('returns null for empty/missing input', () => {
    expect(sanitizeUsername('')).toBeNull();
    expect(sanitizeUsername(null)).toBeNull();
    expect(sanitizeUsername(undefined)).toBeNull();
    expect(sanitizeUsername('   ')).toBeNull();
  });
});
