import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { PSEKseDemandRawItem } from '../../types';

const fetchKseDemandMock = vi.fn();
vi.mock('../../utils/api', () => ({
  fetchKseDemand: (...args: unknown[]) => fetchKseDemandMock(...args),
}));

/** One quarter-hour row of pdgobpkd, matching the shape processKseDemand expects. */
function row(businessDate: string, dtimeUtc: string, demand: number): PSEKseDemandRawItem {
  return { business_date: businessDate, dtime_utc: dtimeUtc, kse_pow_dem: demand };
}

describe('useKseDemand', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 5, 10, 0, 0));
    fetchKseDemandMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches once for a given business date', async () => {
    const { useKseDemand } = await import('../useKseDemand');
    fetchKseDemandMock.mockResolvedValue([
      row('2026-09-05', '2026-09-05 08:00:00', 18000),
    ]);
    const { result } = renderHook(() => useKseDemand(true, '2026-09-05'));

    await waitFor(() => expect(fetchKseDemandMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.byHour.size).toBe(1));
  });

  it('fetches again when the business date changes', async () => {
    const { useKseDemand } = await import('../useKseDemand');
    fetchKseDemandMock.mockResolvedValue([
      row('2026-09-05', '2026-09-05 08:00:00', 18000),
    ]);
    const { rerender } = renderHook(
      ({ date }) => useKseDemand(true, date),
      { initialProps: { date: '2026-09-05' } }
    );
    await waitFor(() => expect(fetchKseDemandMock).toHaveBeenCalledTimes(1));

    rerender({ date: '2026-09-06' });

    await waitFor(() => expect(fetchKseDemandMock).toHaveBeenCalledTimes(2));
    expect(fetchKseDemandMock).toHaveBeenNthCalledWith(2, '2026-09-06');
  });

  it('does not refetch a date already resolved once', async () => {
    const { useKseDemand } = await import('../useKseDemand');
    fetchKseDemandMock.mockResolvedValue([
      row('2026-09-05', '2026-09-05 08:00:00', 18000),
    ]);
    const { rerender, result } = renderHook(
      ({ date }) => useKseDemand(true, date),
      { initialProps: { date: '2026-09-05' } }
    );
    await waitFor(() => expect(fetchKseDemandMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.byHour.size).toBe(1));

    rerender({ date: '2026-09-06' });
    await waitFor(() => expect(fetchKseDemandMock).toHaveBeenCalledTimes(2));

    rerender({ date: '2026-09-05' });

    expect(fetchKseDemandMock).toHaveBeenCalledTimes(2);
    expect(result.current.byHour.size).toBe(1);
  });

  it('resolves to an empty map, without throwing, when the fetch fails', async () => {
    const { useKseDemand } = await import('../useKseDemand');
    fetchKseDemandMock.mockRejectedValue(new Error('brak sieci'));

    const { result } = renderHook(() => useKseDemand(true, '2026-09-05'));

    await waitFor(() => expect(fetchKseDemandMock).toHaveBeenCalledTimes(1));
    expect(result.current.byHour.size).toBe(0);
  });

  it('fetches nothing while disabled', async () => {
    const { useKseDemand } = await import('../useKseDemand');
    renderHook(() => useKseDemand(false, '2026-09-05'));

    expect(fetchKseDemandMock).not.toHaveBeenCalled();
  });
});
