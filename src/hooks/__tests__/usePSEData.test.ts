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
