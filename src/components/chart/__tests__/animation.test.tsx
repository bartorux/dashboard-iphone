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
