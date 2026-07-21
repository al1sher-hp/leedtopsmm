import { describe, it, expect } from 'vitest';
import { shouldIncludeMessage, isMessageTooOld } from '../src/scan/channelScan.js';

const T = (isoString) => Math.floor(new Date(isoString).getTime() / 1000);

describe('isMessageTooOld', () => {
  it('is true when the message predates dateFromSec', () => {
    expect(isMessageTooOld({ date: T('2026-01-01') }, T('2026-02-01'))).toBe(true);
  });

  it('is false when dateFromSec is not set', () => {
    expect(isMessageTooOld({ date: T('2026-01-01') }, null)).toBe(false);
  });

  it('is false when the message is within range', () => {
    expect(isMessageTooOld({ date: T('2026-03-01') }, T('2026-02-01'))).toBe(false);
  });
});

describe('shouldIncludeMessage', () => {
  const inRange = { date: T('2026-02-15'), message: 'Sotiladi, tel: +998901234567' };

  it('excludes messages outside the date range', () => {
    expect(
      shouldIncludeMessage({ date: T('2026-01-01'), message: 'hi' }, { dateFromSec: T('2026-02-01'), dateToSec: T('2026-03-01') })
    ).toBe(false);
    expect(
      shouldIncludeMessage({ date: T('2026-04-01'), message: 'hi' }, { dateFromSec: T('2026-02-01'), dateToSec: T('2026-03-01') })
    ).toBe(false);
  });

  it('includes an in-range message with no keyword filter', () => {
    expect(shouldIncludeMessage(inRange, { dateFromSec: T('2026-02-01'), dateToSec: T('2026-03-01'), keywords: [] })).toBe(
      true
    );
  });

  it('excludes empty-text messages', () => {
    expect(
      shouldIncludeMessage({ date: T('2026-02-15'), message: '' }, { dateFromSec: T('2026-02-01'), dateToSec: T('2026-03-01') })
    ).toBe(false);
  });

  it('applies a case-insensitive keyword filter', () => {
    expect(
      shouldIncludeMessage(inRange, {
        dateFromSec: T('2026-02-01'),
        dateToSec: T('2026-03-01'),
        keywords: ['SOTILADI'],
      })
    ).toBe(true);
    expect(
      shouldIncludeMessage(inRange, {
        dateFromSec: T('2026-02-01'),
        dateToSec: T('2026-03-01'),
        keywords: ['ijaraga'],
      })
    ).toBe(false);
  });

  it('matches if any of several keywords is present', () => {
    expect(
      shouldIncludeMessage(inRange, {
        dateFromSec: T('2026-02-01'),
        dateToSec: T('2026-03-01'),
        keywords: ['ijaraga', 'sotiladi'],
      })
    ).toBe(true);
  });
});
