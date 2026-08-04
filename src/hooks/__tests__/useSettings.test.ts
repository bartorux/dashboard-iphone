import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
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

describe('useSettings — threshold bounds', () => {
  beforeEach(() => localStorage.clear());

  const save = (orange: number, red: number) => {
    const { result } = renderHook(() => useSettings());
    let error: string | null = null;
    act(() => {
      error = result.current.saveSettings({
        orangeThreshold: orange,
        redThreshold: red,
      });
    });
    return { error, settings: result.current.settings };
  };

  it('refuses a threshold large enough to flatten the chart', () => {
    // 999999 stretched the Y axis to 1 052 116 MW and squashed the reserve
    // curve into an invisible line at the bottom
    const { error, settings } = save(999999, 300);

    expect(error).toMatch(/Uwaga/);
    expect(settings.orangeThreshold).toBe(500);
  });

  it('refuses a negative alarm threshold, which would unflag real deficits', () => {
    const { error, settings } = save(500, -5000);

    expect(error).toMatch(/Alarm/);
    expect(settings.redThreshold).toBe(300);
  });

  it('leaves the stored value untouched when it rejects', () => {
    save(999999, 300);
    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.orangeThreshold).toBe(500);
  });

  it('accepts the bounds themselves', () => {
    expect(save(2000, 0).error).toBeNull();
    expect(save(2000, 1500).error).toBeNull();
  });

  it('rejects just outside them', () => {
    expect(save(2001, 300).error).not.toBeNull();
    expect(save(500, -1).error).not.toBeNull();
    expect(save(1600, 1501).error).not.toBeNull();
  });

  it('still requires alarm below warning', () => {
    expect(save(300, 500).error).toMatch(/niższy/);
  });

  it('names the fields, not colours the interface no longer shows', () => {
    const { error } = save(300, 500);

    expect(error).not.toMatch(/czerwon|pomarańcz/i);
  });

  it('clamps values saved before the bounds existed', () => {
    localStorage.setItem(
      'pse-dashboard-settings',
      JSON.stringify({ orangeThreshold: 999999, redThreshold: -5000, version: 1 })
    );

    const { result } = renderHook(() => useSettings());

    // Clamped rather than refused: the app must still start, and a value stored
    // earlier would otherwise break the chart on every visit
    expect(result.current.settings.orangeThreshold).toBe(2000);
    expect(result.current.settings.redThreshold).toBe(0);
  });
});
