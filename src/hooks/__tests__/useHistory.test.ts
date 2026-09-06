import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHistory } from '../useHistory';
import { STORAGE_PREFIX } from '../../utils/constants';
import type { PSERawItem } from '../../types';

const fetchPSEHistoryMock = vi.fn();
vi.mock('../../utils/api', () => ({
  fetchPSEHistory: (...args: unknown[]) => fetchPSEHistoryMock(...args),
}));

const HISTORY_KEY = `${STORAGE_PREFIX}history-cache`;

/** One well-formed hourly row, enough for processData to keep it. */
function rawPoint(businessDate: string, hourUtc: string): PSERawItem {
  return {
    plan_dtime: `${businessDate} 10:00:00`,
    plan_dtime_utc: `${businessDate} ${hourUtc}:00`,
    business_date: businessDate,
    period: '09 - 10',
    req_pow_res: '100',
    surplus_cap_avail_tso: '200',
  } as PSERawItem;
}

describe('useHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 5, 10, 0, 0));
    fetchPSEHistoryMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('fetches nothing while disabled', () => {
    renderHook(() => useHistory(false));

    expect(fetchPSEHistoryMock).not.toHaveBeenCalled();
  });

  it('fetches and caches when enabled', async () => {
    fetchPSEHistoryMock.mockResolvedValue([rawPoint('2026-09-04', '08:00')]);

    const { result } = renderHook(() => useHistory(true));

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(fetchPSEHistoryMock).toHaveBeenCalledTimes(1);
    expect(result.current.points.length).toBe(1);

    const cached = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null');
    expect(cached).not.toBeNull();
    expect(cached.data.length).toBe(1);
  });

  it('serves a still-valid cache without hitting the network again', async () => {
    fetchPSEHistoryMock.mockResolvedValue([rawPoint('2026-09-04', '08:00')]);

    const first = renderHook(() => useHistory(true));
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    expect(fetchPSEHistoryMock).toHaveBeenCalledTimes(1);

    // A fresh mount (e.g. remounting the comparison view) must read the cache
    // instead of asking the network again.
    const second = renderHook(() => useHistory(true));
    await waitFor(() => expect(second.result.current.state).toBe('ready'));

    expect(fetchPSEHistoryMock).toHaveBeenCalledTimes(1);
    expect(second.result.current.points.length).toBe(1);
  });

  it('refetches once the cache has crossed midnight', async () => {
    fetchPSEHistoryMock.mockResolvedValue([rawPoint('2026-09-04', '08:00')]);

    const first = renderHook(() => useHistory(true));
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    expect(fetchPSEHistoryMock).toHaveBeenCalledTimes(1);

    // Jump to the next day — the cache's validUntil (next midnight from when
    // it was written) is now in the past.
    vi.setSystemTime(new Date(2026, 8, 6, 10, 0, 0));

    const second = renderHook(() => useHistory(true));
    await waitFor(() => expect(second.result.current.state).toBe('ready'));

    expect(fetchPSEHistoryMock).toHaveBeenCalledTimes(2);
  });
});
