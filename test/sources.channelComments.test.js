import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseChannelCommentsHtml } from '../src/lib/sources/channelComments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'channel-comments.html'), 'utf8');
const notFoundHtml = fs.readFileSync(path.join(__dirname, 'fixtures', 'channel-comments-not-found.html'), 'utf8');

describe('parseChannelCommentsHtml', () => {
  it('extracts each comment with author, text, url and date', () => {
    const comments = parseChannelCommentsHtml(html, { sourceId: 2 });
    expect(comments).toHaveLength(2);

    const [first, second] = comments;
    expect(first.messageId).toBe(9001);
    expect(first.messageUrl).toBe('https://t.me/elonlar_kanali_comments/9001');
    expect(first.username).toBe('aziz_buyer');
    expect(first.displayName).toBe('Aziz');
    expect(first.text).toContain('+998911234567');
    expect(first.postedAt.toISOString()).toBe('2026-02-12T15:00:00.000Z');

    expect(second.username).toBe('kimdir');
    expect(second.text).toBe("Rahmat, ko'rib chiqaman.");
  });

  it('treats a "not found" / closed-comments page as zero comments, not an error', () => {
    const comments = parseChannelCommentsHtml(notFoundHtml, { sourceId: 2 });
    expect(comments).toEqual([]);
  });

  it('treats an empty page as zero comments', () => {
    expect(parseChannelCommentsHtml('', { sourceId: 2 })).toEqual([]);
  });
});
