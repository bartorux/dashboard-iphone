import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRedispatch } from '../useRedispatch';
import { STORAGE_PREFIX } from '../../utils/constants';
import { visibleBusinessDates } from '../../utils/dayWindow';
import { withRedispatchEntry } from '../../utils/redispatchCache';
import type { RedispatchHour } from '../../utils/redispatch';

const fetchRedispatchMock = vi.fn();
vi.mock('../../utils/api', () => ({
  fetchRedispatch: (...args: unknown[]) => fetchRedispatchMock(...args),
}));

const KEY = `${STORAGE_PREFIX}redispatch-cache`;

function hour(businessDate: string, hourStartMs: number): RedispatchHour {
  return { hourStartMs, businessDate, pvRed: -120, windRed: 0 };
}

describe('useRedispatch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 6, 10, 0, 0));
    fetchRedispatchMock.mockReset();
    fetchRedispatchMock.mockResolvedValue([]);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves a cached day in the very first render, before any effect runs', () => {
    // The double draw the reader saw came from the cached day arriving one
    // render late. It has to be there the moment the day is asked for.
    const date = '2026-09-07';
    const rows = [hour(date, Date.UTC(2026, 8, 7, 10))];
    localStorage.setItem(
      KEY,
      JSON.stringify(withRedispatchEntry({}, date, rows, Date.now(), visibleBusinessDates(new Date())))
    );

    // Recorded DURING each render: `result.current` after renderHook already
    // reflects the effect that copies the cache into state, so it cannot
    // tell a synchronous hit from one render late — and one render late is
    // the bug.
    const sizesPerRender: number[] = [];
    const { result } = renderHook(() => {
      const value = useRedispatch(true, date);
      sizesPerRender.push(value.byHour.size);
      return value;
    });
    expect(sizesPerRender[0]).toBe(1);
    expect(result.current.byHour.get(Date.UTC(2026, 8, 7, 10))?.pvRed).toBe(-120);
  });

  it('warms every visible day once enabled, not only the one on screen', async () => {
    const visible = visibleBusinessDates(new Date());
    renderHook(() => useRedispatch(true, visible[0]));
    await waitFor(() => expect(fetchRedispatchMock).toHaveBeenCalledTimes(visible.length));
    const asked = fetchRedispatchMock.mock.calls.map((call) => call[0] as string).sort();
    expect(asked).toEqual([...visible].sort());
  });

  it('asks for each day at most once per session, even across day switches', async () => {
    const visible = visibleBusinessDates(new Date());
    const { rerender } = renderHook(({ date }) => useRedispatch(true, date), {
      initialProps: { date: visible[0] },
    });
    await waitFor(() => expect(fetchRedispatchMock).toHaveBeenCalledTimes(visible.length));
    rerender({ date: visible[1] ?? visible[0] });
    rerender({ date: visible[0] });
    expect(fetchRedispatchMock).toHaveBeenCalledTimes(visible.length);
  });

  it('fetches nothing while the generation view is not on screen', () => {
    renderHook(() => useRedispatch(false, '2026-09-07'));
    expect(fetchRedispatchMock).not.toHaveBeenCalled();
  });
});
