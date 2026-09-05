import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PSECompassRawItem } from '../../types';

/** A minimal, well-formed pdgsz row for one hour of one business day. */
function row(businessDate: string, hour: string, usage: number): PSECompassRawItem {
  return {
    business_date: businessDate,
    dtime: `${businessDate} ${hour}`,
    dtime_utc: `${businessDate} ${hour}`,
    usage_fcst: usage,
    is_active: true,
    publication_ts_utc: '2026-09-05 12:00:00.000',
  };
}

// fetchCompass swallows every transport failure into [] (see `query` in
// api.ts), so it never actually rejects. Mocking the module boundary lets
// this file exercise the hook's OWN branches — the day-keyed lookup, the
// day-change refetch, and the defensive catch — directly and
// deterministically, rather than only the cases reachable through a real
// network response. The `is_active eq true` filter itself is covered against
// the REAL fetchCompass in useCompass.filter.test.ts instead, which this
// module-level mock would otherwise hide.
const fetchCompassMock = vi.fn();
vi.mock('../../utils/api', () => ({
  fetchCompass: (...args: unknown[]) => fetchCompassMock(...args),
}));

describe('useCompass', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 5, 10, 0, 0));
    fetchCompassMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns nothing for a business day with no published rows, never another day's", async () => {
    const { useCompass } = await import('../useCompass');
    // The window can come back with rows for one day and none for another —
    // pdgsz is under no obligation to have published today by the time this
    // runs. Today itself must read empty, not tomorrow's flags.
    fetchCompassMock.mockResolvedValue([row('2026-09-06', '10:00', 3)]);
    const { result } = renderHook(() => useCompass(true, '2026-09-05'));

    await waitFor(() => expect(fetchCompassMock).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hours).toEqual([]);
  });

  it('refetches when the current business date changes (day rollover)', async () => {
    const { useCompass } = await import('../useCompass');
    fetchCompassMock.mockResolvedValue([row('2026-09-05', '10:00', 1)]);
    const { rerender } = renderHook(
      ({ businessDate }) => useCompass(true, businessDate),
      { initialProps: { businessDate: '2026-09-05' } }
    );

    await waitFor(() => expect(fetchCompassMock).toHaveBeenCalledTimes(1));

    rerender({ businessDate: '2026-09-06' });

    await waitFor(() => expect(fetchCompassMock).toHaveBeenCalledTimes(2));
  });

  it('does not refetch on a rerender that keeps the same business date', async () => {
    const { useCompass } = await import('../useCompass');
    fetchCompassMock.mockResolvedValue([row('2026-09-05', '10:00', 1)]);
    const { rerender } = renderHook(
      ({ businessDate }) => useCompass(true, businessDate),
      { initialProps: { businessDate: '2026-09-05' } }
    );

    await waitFor(() => expect(fetchCompassMock).toHaveBeenCalledTimes(1));

    rerender({ businessDate: '2026-09-05' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchCompassMock).toHaveBeenCalledTimes(1);
  });

  it('clears stale data to empty on a failed refresh, then lets refresh() retry', async () => {
    const { useCompass } = await import('../useCompass');
    fetchCompassMock.mockResolvedValueOnce([row('2026-09-05', '10:00', 1)]);
    const { result } = renderHook(() => useCompass(true, '2026-09-05'));
    await waitFor(() => expect(result.current.hours.length).toBe(1));

    fetchCompassMock.mockRejectedValueOnce(new Error('brak sieci'));
    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hours).toEqual([]);

    // The next refresh succeeds again.
    fetchCompassMock.mockResolvedValueOnce([row('2026-09-05', '10:00', 2)]);
    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchCompassMock).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current.hours.length).toBe(1));
  });
});
