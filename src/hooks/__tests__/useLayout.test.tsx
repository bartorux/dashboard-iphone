import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLayout } from '../useLayout';
import { usePersistentChoice } from '../usePersistentChoice';
import { DEFAULT_LAYOUT } from '../../utils/layout';

const KEY = 'pse-dashboard-layout';
const read = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');

describe('useLayout', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    delete document.documentElement.dataset.chart;
    vi.restoreAllMocks();
  });

  it('starts from the default layout and saves every change whole', () => {
    const { result } = renderHook(() => useLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);

    act(() => result.current.toggle('news'));
    expect(read()).toEqual({ version: 1, chart: 'standard', hidden: ['news'] });

    act(() => result.current.setChart('tall'));
    expect(read()).toEqual({ version: 1, chart: 'tall', hidden: ['news'] });
  });

  it('reads back what was stored, and clamps what was not', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, chart: 'compact', hidden: ['mix', 'sport'] }));
    const { result } = renderHook(() => useLayout());
    expect(result.current.layout).toEqual({ version: 1, chart: 'compact', hidden: ['mix'] });
  });

  it('writes the chart size where the CSS can read it, and takes it back on unmount', () => {
    const { result, unmount } = renderHook(() => useLayout());
    expect(document.documentElement.dataset.chart).toBe('standard');
    act(() => result.current.setChart('compact'));
    expect(document.documentElement.dataset.chart).toBe('compact');
    unmount();
    expect(document.documentElement.dataset.chart).toBeUndefined();
  });

  it('restores the defaults, clearing the layout key only', () => {
    localStorage.setItem('pse-dashboard-summary-expanded', 'false');
    const { result } = renderHook(() => useLayout());
    act(() => result.current.toggle('trends'));
    act(() => result.current.reset());

    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    // Collapsing a card is a reading habit, not a layout, so it is not swept up.
    expect(localStorage.getItem('pse-dashboard-summary-expanded')).toBe('false');
  });

  it('keeps working when storage throws, for this session', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(() => act(() => result.current.toggle('mix'))).not.toThrow();
    expect(result.current.layout.hidden).toEqual(['mix']);
  });
});

describe('usePersistentChoice', () => {
  const OPTIONS = ['reserve', 'generation', 'history'] as const;
  beforeEach(() => localStorage.clear());

  it('remembers a choice across mounts', () => {
    const first = renderHook(() => usePersistentChoice('chart-view', OPTIONS, 'reserve'));
    act(() => first.result.current[1]('history'));
    expect(localStorage.getItem('pse-dashboard-chart-view')).toBe('history');

    const second = renderHook(() => usePersistentChoice('chart-view', OPTIONS, 'reserve'));
    expect(second.result.current[0]).toBe('history');
  });

  it('ignores a stored value that is not one of the choices', () => {
    localStorage.setItem('pse-dashboard-chart-view', 'pogoda');
    const { result } = renderHook(() => usePersistentChoice('chart-view', OPTIONS, 'reserve'));
    expect(result.current[0]).toBe('reserve');
  });

  it('refuses to store a value that is not one of the choices', () => {
    const { result } = renderHook(() => usePersistentChoice('chart-view', OPTIONS, 'reserve'));
    act(() => (result.current[1] as (value: string) => void)('pogoda'));
    expect(result.current[0]).toBe('reserve');
    expect(localStorage.getItem('pse-dashboard-chart-view')).toBeNull();
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => usePersistentChoice('chart-view', OPTIONS, 'reserve'));
    expect(() => act(() => result.current[1]('generation'))).not.toThrow();
    expect(result.current[0]).toBe('generation');
    vi.restoreAllMocks();
  });
});
