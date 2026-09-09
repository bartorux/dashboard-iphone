import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRefreshButton } from '../useRefreshButton';

type Listener = () => void;

/** matchMedia stub keyed by query, with a way to flip a query and notify. */
function stubMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return state[query] ?? false;
      },
      media: query,
      addEventListener: (_: string, fn: Listener) => {
        (listeners.get(query) ?? listeners.set(query, new Set()).get(query)!).add(fn);
      },
      removeEventListener: (_: string, fn: Listener) => listeners.get(query)?.delete(fn),
    }))
  );
  return {
    flip(query: string, value: boolean) {
      state[query] = value;
      for (const fn of listeners.get(query) ?? []) fn();
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  };
}

describe('useRefreshButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { standalone?: boolean }).standalone;
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
  });

  it('hides the button in a plain desktop browser — F5 is there', () => {
    stubMatchMedia({ '(display-mode: standalone)': false, '(pointer: coarse)': false });
    const { result } = renderHook(() => useRefreshButton());
    expect(result.current).toBe(false);
  });

  it('shows it on a touch screen', () => {
    stubMatchMedia({ '(display-mode: standalone)': false, '(pointer: coarse)': true });
    expect(renderHook(() => useRefreshButton()).result.current).toBe(true);
  });

  it('shows it when the device reports touch points, even without the coarse-pointer media', () => {
    // Playwright's iPhone profile in the visual guard reports touch points
    // only; a real iPhone reports both. Either is a finger.
    stubMatchMedia({ '(display-mode: standalone)': false, '(pointer: coarse)': false });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    expect(renderHook(() => useRefreshButton()).result.current).toBe(true);
  });

  it('shows it in an installed app, which has no reload control', () => {
    stubMatchMedia({ '(display-mode: standalone)': true, '(pointer: coarse)': false });
    expect(renderHook(() => useRefreshButton()).result.current).toBe(true);
  });

  it('shows it for Safari standalone, which reports itself on navigator', () => {
    stubMatchMedia({ '(display-mode: standalone)': false, '(pointer: coarse)': false });
    (navigator as { standalone?: boolean }).standalone = true;
    expect(renderHook(() => useRefreshButton()).result.current).toBe(true);
  });

  it('decides once at mount and never subscribes — a media flip must not flicker the button', () => {
    // Chromium re-evaluates device metrics for a full-page capture, and the
    // coarse-pointer query flipped for a frame; a listener hid the button
    // right before the capture. The same can happen on a real viewport change.
    const media = stubMatchMedia({ '(display-mode: standalone)': false, '(pointer: coarse)': true });
    const { result, rerender } = renderHook(() => useRefreshButton());
    expect(result.current).toBe(true);
    act(() => media.flip('(pointer: coarse)', false));
    rerender();
    expect(result.current).toBe(true);
    expect(media.listenerCount('(pointer: coarse)')).toBe(0);
    expect(media.listenerCount('(display-mode: standalone)')).toBe(0);
  });

  it('defaults to showing when matchMedia does not exist — the button is the safe side', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useRefreshButton()).result.current).toBe(true);
  });
});
