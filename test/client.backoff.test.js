import { describe, it, expect } from 'vitest';
import { backoffDelayMs } from '../src/telegram/client.js';

describe('backoffDelayMs', () => {
  it('doubles with each attempt', () => {
    expect(backoffDelayMs(0)).toBe(1000);
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
    expect(backoffDelayMs(3)).toBe(8000);
  });

  it('caps at 30 seconds for large attempt counts', () => {
    expect(backoffDelayMs(10)).toBe(30_000);
    expect(backoffDelayMs(100)).toBe(30_000);
  });
});
