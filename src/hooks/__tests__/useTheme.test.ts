import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';
import { STORAGE_PREFIX } from '../../utils/constants';

const THEME_KEY = `${STORAGE_PREFIX}theme`;

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to "system" when nothing is stored', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('system');
  });

  it('reads a previously stored preference', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('dark');
  });

  it('ignores a corrupted stored value and falls back to "system"', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('system');
  });

  it('setTheme("dark") pins data-theme on <html> and persists the choice', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('setTheme("light") pins data-theme to "light"', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('setTheme("system") removes the data-theme attribute entirely', () => {
    document.documentElement.dataset.theme = 'dark';
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('system');
    });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
  });
});
