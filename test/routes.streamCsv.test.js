import { describe, it, expect, vi } from 'vitest';
import { streamCsv } from '../src/api/routes.js';

function makeMockRes() {
  return {
    headers: {},
    written: [],
    ended: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    write(chunk) {
      this.written.push(chunk);
    },
    end() {
      this.ended = true;
    },
  };
}

describe('streamCsv', () => {
  it('writes a BOM-prefixed header before any rows and ends the response', async () => {
    const res = makeMockRes();
    await streamCsv(res, 'test.csv', ['a', 'b'], async () => [], 2);
    expect(res.written[0]).toBe('﻿a,b');
    expect(res.ended).toBe(true);
  });

  it('sets CSV content-type and attachment filename headers', async () => {
    const res = makeMockRes();
    await streamCsv(res, 'my-export.csv', ['a'], async () => [], 2);
    expect(res.headers['Content-Type']).toMatch(/text\/csv/);
    expect(res.headers['Content-Disposition']).toContain('my-export.csv');
  });

  it('paginates across multiple batches until a short page is returned', async () => {
    const res = makeMockRes();
    const rows = [{ a: '1' }, { a: '2' }, { a: '3' }, { a: '4' }, { a: '5' }];
    const calls = [];
    const fetchPage = vi.fn(async (offset, limit) => {
      calls.push([offset, limit]);
      return rows.slice(offset, offset + limit);
    });

    await streamCsv(res, 'test.csv', ['a'], fetchPage, 2);

    // 5 qator, paket hajmi=2 -> [0,2), [2,2), [4,2) -> 3 chaqiruv, oxirgisi qisqa
    expect(calls).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
    ]);
    expect(res.written.join('')).toBe('﻿a\n1\n2\n3\n4\n5');
  });

  it('never calls fetchPage again once a short (final) page is returned', async () => {
    const res = makeMockRes();
    const fetchPage = vi.fn(async () => [{ a: '1' }]); // doim 1 ta qaytaradi (< batchSize)
    await streamCsv(res, 'test.csv', ['a'], fetchPage, 5);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('escapes values containing commas, quotes, or newlines', async () => {
    const res = makeMockRes();
    const rows = [{ a: 'has,comma', b: 'has"quote', c: 'has\nnewline' }];
    await streamCsv(res, 'test.csv', ['a', 'b', 'c'], async (offset) => (offset === 0 ? rows : []), 10);
    const body = res.written.join('');
    expect(body).toContain('"has,comma"');
    expect(body).toContain('"has""quote"');
    expect(body).toContain('"has\nnewline"');
  });

  it('produces just the header for an empty result set', async () => {
    const res = makeMockRes();
    await streamCsv(res, 'test.csv', ['a'], async () => [], 10);
    expect(res.written).toEqual(['﻿a']);
    expect(res.ended).toBe(true);
  });
});
