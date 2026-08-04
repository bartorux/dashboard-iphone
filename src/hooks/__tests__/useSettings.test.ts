import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSettings } from '../useSettings';

describe('useSettings', () => {
  beforeEach(() => localStorage.clear());

  it('ignores a key left over from a removed setting', () => {
    // Entries written before the update banner was removed still carry
    // disableUpdates. Spreading over the defaults drops it, so no migration.
    localStorage.setItem(
      'pse-dashboard-settings',
      JSON.stringify({
        orangeThreshold: 600,
        redThreshold: 400,
        disableUpdates: true,
        version: 1,
      })
    );

    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.orangeThreshold).toBe(600);
    expect(result.current.settings.redThreshold).toBe(400);
    expect('disableUpdates' in result.current.settings).toBe(false);
  });

  it('falls back to defaults when storage holds junk', () => {
    localStorage.setItem('pse-dashboard-settings', 'not json');

    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.orangeThreshold).toBe(500);
  });
});
