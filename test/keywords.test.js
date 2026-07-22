import { describe, it, expect } from 'vitest';
import { sanitizeKeywords, MAX_KEYWORDS } from '../src/utils/keywords.js';

describe('sanitizeKeywords', () => {
  it('trims whitespace', () => {
    expect(sanitizeKeywords(['  Toshkent  ', 'biznes '])).toEqual(['Toshkent', 'biznes']);
  });

  it('drops empty/whitespace-only entries', () => {
    expect(sanitizeKeywords(['Toshkent', '', '   ', 'biznes'])).toEqual(['Toshkent', 'biznes']);
  });

  it('removes exact duplicates, keeping first occurrence', () => {
    expect(sanitizeKeywords(['SMM', 'reklama', 'SMM', 'reklama'])).toEqual(['SMM', 'reklama']);
  });

  it('does not treat different casing as a duplicate', () => {
    expect(sanitizeKeywords(['Toshkent', 'toshkent'])).toEqual(['Toshkent', 'toshkent']);
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeKeywords(undefined)).toEqual([]);
    expect(sanitizeKeywords(null)).toEqual([]);
    expect(sanitizeKeywords('Toshkent')).toEqual([]);
  });

  it('coerces non-string items', () => {
    expect(sanitizeKeywords([123, 'biznes'])).toEqual(['123', 'biznes']);
  });

  it('exposes a sane MAX_KEYWORDS cap', () => {
    expect(MAX_KEYWORDS).toBe(50);
  });
});
