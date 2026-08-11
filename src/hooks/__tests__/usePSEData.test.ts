import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePSEData } from '../usePSEData';
import { PSERawItem } from '../../types';

import fixture from '../../utils/__fixtures__/pse-72h.json';

const RAW = (fixture as { value: PSERawItem[] }).value;

/** The fixture covers business days 2026-08-03 .. 2026-08-05. */
const EVENING = new Date(2026, 7, 3, 23, 59, 30);
/** Far from midnight, so advancing time cannot trip the day-rollover timer. */
const MIDDAY = new Date(2026, 7, 3, 12, 0, 0);

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ value: RAW }),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePSEData', () => {
  beforeEach(() => {
    localStorage.clear();
    // shouldAdvanceTime lets waitFor make progress; without it the timers stay
    // frozen and every wait runs to its timeout.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(MIDDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setHidden(false);
  });

  it('moves the day slice at midnight without waiting for a fetch', async () => {
    vi.setSystemTime(EVENING);
    const fetchMock = mockFetch();
    const { result } = renderHook(() => usePSEData());
    await waitFor(() => expect(result.current.dayData.length).toBeGreaterThan(0));

    expect(result.current.dayData[0].businessDate).toBe('2026-08-03');

    // From here on every fetch hangs. The rollover also triggers a refresh, so
    // without this the slice would move once new data arrived and the test
    // would pass even with a stale memo — proving nothing.
    fetchMock.mockImplementation(() => new Promise(() => {}));

    // Cross midnight by advancing the virtual clock, which moves Date.now()
    // and fires the scheduled rollover — setSystemTime alone would move the
    // clock without ever running the timer.
    //
    // getDataForDay reads the clock, so without a day token in the memo the
    // slice kept describing yesterday while the tabs already showed the new date.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40 * 1000);
    });

    expect(result.current.dayData[0].businessDate).toBe('2026-08-04');
  });

  it('refreshes on return to the app when the data has gone stale', async () => {
    const fetchMock = mockFetch();
    renderHook(() => usePSEData());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const afterMount = fetchMock.mock.calls.length;

    await act(async () => {
      setHidden(true);
      vi.setSystemTime(new Date(MIDDAY.getTime() + 10 * 60 * 1000));
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterMount);
  });

  it('does not refetch when returning after only a moment', async () => {
    const fetchMock = mockFetch();
    renderHook(() => usePSEData());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const afterMount = fetchMock.mock.calls.length;

    await act(async () => {
      setHidden(true);
      vi.setSystemTime(new Date(MIDDAY.getTime() + 5000));
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock.mock.calls.length).toBe(afterMount);
  });

  it('stops polling while the app is hidden', async () => {
    const fetchMock = mockFetch();
    renderHook(() => usePSEData());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    setHidden(true);
    const afterHide = fetchMock.mock.calls.length;

    // Well past the 15-minute interval — nothing should have fired
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40 * 60 * 1000);
    });

    expect(fetchMock.mock.calls.length).toBe(afterHide);
  });

  it('exposes today alongside the selected day', async () => {
    mockFetch();
    const { result } = renderHook(() => usePSEData());
    await waitFor(() => expect(result.current.todayData.length).toBeGreaterThan(0));

    act(() => result.current.switchDay(1));

    expect(result.current.dayData[0].businessDate).toBe('2026-08-04');
    expect(result.current.todayData[0].businessDate).toBe('2026-08-03');
  });
});

describe('usePSEData — cache a nieudane pobranie', () => {
  /** A cache exactly as the hook writes one — the whole point is that one exists. */
  function seedCache() {
    localStorage.setItem(
      'pse-dashboard-data-cache',
      JSON.stringify({
        data: [
          {
            businessDate: '2026-08-03',
            hourLabel: '10:00',
            endLabel: '11:00',
            time: new Date('2026-08-03T09:00:00Z').toISOString(),
            timeStr: '2026-08-03 11:00:00',
            reserve: 3000,
            required: 2000,
            demand: null,
            pv: null,
            wind: null,
            outages: null,
            exchange: null,
            generation: null,
          },
        ],
        timestamp: '10:15',
        savedAt: Date.now(),
      })
    );
  }

  it('does not call the data stale while the first fetch is still in flight', () => {
    // The warning used to fire on every reload that had a cache, for the half
    // second before the network answered. Measured live: visible at 51ms, gone
    // at 533ms. A warning on the normal path teaches people to ignore it on the
    // path that matters.
    //
    // The cache has to be seeded or this proves nothing: with none present the
    // old code started false as well, and a mutation restoring it passed.
    seedCache();
    const { result } = renderHook(() => usePSEData());

    expect(result.current.hasData).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.hasFreshData).toBe(false);
  });

  it('calls it stale once a fetch has actually failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('brak sieci')));
    const { result } = renderHook(() => usePSEData());

    await waitFor(() => expect(result.current.isStale).toBe(true));
    expect(result.current.hasFreshData).toBe(false);
  });
});
