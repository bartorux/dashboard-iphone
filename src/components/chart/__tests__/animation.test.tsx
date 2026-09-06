import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ANIMATION_MS, useChartAnimationMs } from '../shared';

function pytanie(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

describe('useChartAnimationMs', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('animuje normalnie, gdy nikt o nic nie prosił', () => {
    pytanie(false);
    const { result } = renderHook(() => useChartAnimationMs());

    expect(result.current).toBe(ANIMATION_MS);
  });

  it('milknie, gdy czytelnik prosi o mniej ruchu', () => {
    /*
     * Blok `prefers-reduced-motion` w CSS tu nie sięga: Recharts bierze czas
     * trwania jako prop Reacta i animuje w JavaScripcie, więc reguła zerująca
     * `animation-duration` przechodzi obok. Kto ściszył ruch w ustawieniach
     * systemu, dostawał pełne 450 ms na każdym wykresie i przy każdej zmianie
     * dnia — czyli ustawienie zawodziło po cichu.
     */
    pytanie(true);
    const { result } = renderHook(() => useChartAnimationMs());

    expect(result.current).toBe(0);
  });

  it('nie wywraca się tam, gdzie matchMedia nie istnieje', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useChartAnimationMs());

    expect(result.current).toBe(ANIMATION_MS);
  });
});

describe('useAnimateOnDataChange', () => {
  it('animates a new day and snaps a late layer', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useAnimateOnDataChange } = await import('../shared');
    const day = [{ hour: 1 }];
    const { result, rerender } = renderHook(({ data }) => useAnimateOnDataChange(data), {
      initialProps: { data: day as unknown },
    });
    // First draw of a day: animate.
    expect(result.current).toBe(true);
    // Same day, some other prop changed (curtailment landed): no replay.
    rerender({ data: day as unknown });
    expect(result.current).toBe(false);
    // A different day: animate again.
    rerender({ data: [{ hour: 2 }] as unknown });
    expect(result.current).toBe(true);
  });
});
