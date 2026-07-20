import { describe, it, expect } from 'vitest';
import { extractUsernames, extractContactUsername, isLikelyBotUsername } from '../src/extract/username.js';

describe('extractUsernames', () => {
  it('finds all @usernames in text, deduplicated and lowercased', () => {
    const text = 'Reklama: @SomeShop, savollar uchun @someshop yoki @another_one';
    expect(extractUsernames(text)).toEqual(['someshop', 'another_one']);
  });

  it('returns an empty array for text with no usernames', () => {
    expect(extractUsernames('hech narsa yoq')).toEqual([]);
    expect(extractUsernames(null)).toEqual([]);
  });
});

describe('extractContactUsername', () => {
  it('prefers a username near a contact keyword', () => {
    const text = "Ushbu kanal @my_channel tomonidan yuritiladi.\nReklama uchun: @ads_manager";
    expect(extractContactUsername(text, 'my_channel')).toBe('ads_manager');
  });

  it('falls back to the first non-self username when no keyword match', () => {
    const text = 'Kanal @my_channel, do\'stimiz @random_guy bilan hamkorlik.';
    expect(extractContactUsername(text, 'my_channel')).toBe('random_guy');
  });

  it('excludes the channel\'s own username', () => {
    const text = 'Bu @my_channel kanali.';
    expect(extractContactUsername(text, 'my_channel')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(extractContactUsername('', 'my_channel')).toBeNull();
  });
});

describe('isLikelyBotUsername', () => {
  it('flags usernames ending in "bot" (case-insensitive)', () => {
    expect(isLikelyBotUsername('order_bot')).toBe(true);
    expect(isLikelyBotUsername('ShopBot')).toBe(true);
  });

  it('does not flag regular usernames', () => {
    expect(isLikelyBotUsername('some_shop')).toBe(false);
    expect(isLikelyBotUsername('botanika_uz')).toBe(false);
  });

  it('handles null/empty input', () => {
    expect(isLikelyBotUsername(null)).toBe(false);
    expect(isLikelyBotUsername('')).toBe(false);
  });
});
