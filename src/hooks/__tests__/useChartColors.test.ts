import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChartColors } from '../useChartColors';

/*
 * Etap 2, naprawa D: --text-tertiary was re-stepped for body-text legibility
 * (light #8e8e93 -> #6e6e73), which would have darkened every chart axis and
 * grid tick as a side effect had the chart kept reading that token. A new
 * --axis token, pinned at the pre-D value in both themes, exists so the
 * chart can be proven untouched — not by eyeballing a screenshot, but by
 * showing the hook now tracks --axis and has stopped tracking
 * --text-tertiary.
 */
describe('useChartColors — axis token (etap 2, naprawa D)', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--axis');
    document.documentElement.style.removeProperty('--text-tertiary');
  });

  it('reads axis colour from --axis, not from --text-tertiary', () => {
    document.documentElement.style.setProperty('--axis', '#123456');
    // A decoy: if the hook still read the old token, this is what it would
    // report instead.
    document.documentElement.style.setProperty('--text-tertiary', '#abcdef');

    const { result } = renderHook(() => useChartColors());

    expect(result.current.axis).toBe('#123456');
    expect(result.current.axis).not.toBe('#abcdef');
  });

  it('falls back to the pre-D tertiary value (#8e8e93) when no token is set', () => {
    // jsdom's getComputedStyle reports an empty string for an unset custom
    // property, which is exactly the "before first paint" case FALLBACK
    // exists for.
    const { result } = renderHook(() => useChartColors());

    expect(result.current.axis).toBe('#8e8e93');
  });
});
