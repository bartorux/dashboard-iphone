import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useThemeColorMeta } from '../useThemeColorMeta';
import { STATUS_THEME_COLOR } from '../../utils/status';
import type { SystemStatus } from '../../types';

function addMetaTag(): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.appendChild(meta);
  return meta;
}

describe('useThemeColorMeta', () => {
  afterEach(() => {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((el) => el.remove());
  });

  it('sets the meta tag content to the colour for the given status', () => {
    const meta = addMetaTag();
    renderHook(() => useThemeColorMeta('ok'));

    expect(meta.content).toBe(STATUS_THEME_COLOR.ok);
  });

  it('updates the meta tag when the status changes', () => {
    const meta = addMetaTag();
    const { rerender } = renderHook(
      ({ status }: { status: SystemStatus }) => useThemeColorMeta(status),
      { initialProps: { status: 'ok' } }
    );
    expect(meta.content).toBe(STATUS_THEME_COLOR.ok);

    rerender({ status: 'alarm' });

    expect(meta.content).toBe(STATUS_THEME_COLOR.alarm);
  });

  it('covers every status with a distinct colour mapping', () => {
    const meta = addMetaTag();
    (['ok', 'warn', 'alarm', 'unknown'] as const).forEach((status) => {
      const { unmount } = renderHook(() => useThemeColorMeta(status));
      expect(meta.content).toBe(STATUS_THEME_COLOR[status]);
      unmount();
    });
  });

  it('does nothing, without throwing, when no theme-color meta tag exists', () => {
    expect(() => {
      renderHook(() => useThemeColorMeta('ok'));
    }).not.toThrow();
  });
});
