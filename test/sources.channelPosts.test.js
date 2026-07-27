import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseChannelPostsHtml } from '../src/lib/sources/channelPosts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'channel-posts.html'), 'utf8');
const page2Html = fs.readFileSync(path.join(__dirname, 'fixtures', 'channel-posts-page2.html'), 'utf8');

describe('parseChannelPostsHtml', () => {
  it('extracts every post with its message id, text, url and date', () => {
    const { messages } = parseChannelPostsHtml(html, { username: 'elonlar_kanali', sourceId: 1 });
    expect(messages).toHaveLength(3);

    const [first, second, third] = messages;
    expect(first.messageId).toBe(420);
    expect(first.messageUrl).toBe('https://t.me/elonlar_kanali/420');
    expect(first.text).toContain("Narxi 120 000 000 so'm");
    expect(first.postedAt).toBeInstanceOf(Date);
    expect(first.postedAt.toISOString()).toBe('2026-02-10T09:15:00.000Z');

    expect(second.messageId).toBe(421);
    expect(second.text).toContain('+998 90 123 45 67');

    expect(third.messageId).toBe(425);
    expect(third.text).toContain('901234568');
  });

  it('turns <br> into newlines so adjacent lines do not run together', () => {
    const { messages } = parseChannelPostsHtml(html, { username: 'elonlar_kanali', sourceId: 1 });
    const second = messages.find((m) => m.messageId === 421);
    expect(second.text).toBe("Kvartira sotiladi, kelishamiz.\nBog'lanish: +998 90 123 45 67");
  });

  it('computes the min/max message id for pagination', () => {
    const { minId, maxId } = parseChannelPostsHtml(html, { username: 'elonlar_kanali', sourceId: 1 });
    expect(minId).toBe(420);
    expect(maxId).toBe(425);
  });

  it('parses an older page (as fetched via ?before=) independently', () => {
    const { messages, minId, maxId } = parseChannelPostsHtml(page2Html, { username: 'elonlar_kanali', sourceId: 1 });
    expect(messages.map((m) => m.messageId)).toEqual([410, 415]);
    expect(minId).toBe(410);
    expect(maxId).toBe(415);
  });

  it('returns an empty result for a page with no posts', () => {
    const { messages, minId, maxId } = parseChannelPostsHtml('<html><body></body></html>', {
      username: 'elonlar_kanali',
      sourceId: 1,
    });
    expect(messages).toEqual([]);
    expect(minId).toBeNull();
    expect(maxId).toBeNull();
  });
});
