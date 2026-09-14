import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePrices } from '../usePrices';

function respondWith(value: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => value }));
}

const confirmedHour = (hour: number) => ({ hour, price: 800 + hour, p10: null, p90: null });
const forecastHour = (hour: number) => ({
  hour,
  price: 700 + hour,
  p10: 500 + hour,
  p90: 1000 + hour,
});

const validFile = {
  changedAt: '2026-08-04T10:00:00Z',
  source: 'pradcast.pl' as const,
  days: [
    {
      date: '2026-08-04',
      source: 'confirmed' as const,
      horizon: null,
      confidence: null,
      hours: Array.from({ length: 24 }, (_, hour) => confirmedHour(hour)),
    },
    {
      date: '2026-08-05',
      source: 'forecast' as const,
      horizon: 'D+1' as const,
      confidence: 'medium' as const,
      hours: Array.from({ length: 24 }, (_, hour) => forecastHour(hour)),
    },
  ],
};

describe('usePrices', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('returns a well-formed file', async () => {
    respondWith(validFile);
    const { result } = renderHook(() => usePrices().prices);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.days).toHaveLength(2);
    expect(result.current?.days[0].source).toBe('confirmed');
    expect(result.current?.days[1].source).toBe('forecast');
  });

  it('accepts an empty days list — a valid "pradcast returned nothing yet" file', async () => {
    respondWith({ ...validFile, days: [] });
    const { result } = renderHook(() => usePrices().prices);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.days).toEqual([]);
  });

  it('treats a 404 as "no prices", without throwing', async () => {
    respondWith(null, false);
    const { result } = renderHook(() => usePrices().prices);

    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });

  it.each([
    ['missing changedAt', { ...validFile, changedAt: undefined }],
    ['wrong source', { ...validFile, source: 'somewhere-else' }],
    ['days not an array', { ...validFile, days: 'nope' }],
    [
      'a day missing its hours',
      { ...validFile, days: [{ date: '2026-08-04', source: 'confirmed', horizon: null, confidence: null }] },
    ],
    [
      'a horizon outside D+1..D+3',
      {
        ...validFile,
        days: [{ date: '2026-08-06', source: 'forecast', horizon: 'D+5', confidence: 'low', hours: [] }],
      },
    ],
    [
      'a forecast hour whose p10 is a string',
      {
        ...validFile,
        days: [
          {
            date: '2026-08-05',
            source: 'forecast',
            horizon: 'D+1',
            confidence: 'low',
            hours: [{ hour: 0, price: 700, p10: 'dużo', p90: 900 }],
          },
        ],
      },
    ],
  ])('refuses a malformed file: %s', async (_label, payload) => {
    respondWith(payload);
    const { result } = renderHook(() => usePrices().prices);

    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });

  it('survives a dead network without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result } = renderHook(() => usePrices().prices);

    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });

  it('fetches again when the app comes back to the foreground', async () => {
    respondWith(validFile);
    const { result } = renderHook(() => usePrices().prices);
    await waitFor(() => expect(result.current).not.toBeNull());

    const later = { ...validFile, changedAt: '2026-08-04T18:00:00Z', days: [] };
    respondWith(later);
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(result.current?.days).toEqual([]));
  });
});
