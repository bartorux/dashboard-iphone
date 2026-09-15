import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { THEME_COLOR, useThemeColorMeta } from '../useThemeColorMeta';
import type { ThemePreference } from '../useTheme';
// `?raw`, as in designTokens.test.ts: the literal files, so the three copies of
// the bar's colour cannot drift apart without a failure here.
import css from '../../App.css?raw';
import indexHtml from '../../../index.html?raw';

function addMetaTag(scheme: 'light' | 'dark'): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`);
  meta.content = 'placeholder';
  document.head.appendChild(meta);
  return meta;
}

function tokenValue(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found in App.css`);
  return match[1].trim();
}

describe('useThemeColorMeta', () => {
  afterEach(() => {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((el) => el.remove());
  });

  it('follows the system: each tag carries its own scheme’s bar colour', () => {
    const light = addMetaTag('light');
    const dark = addMetaTag('dark');
    renderHook(() => useThemeColorMeta('system'));

    expect(light.content).toBe(THEME_COLOR.light);
    expect(dark.content).toBe(THEME_COLOR.dark);
  });

  it('a theme forced in the settings wins over the system on both tags', () => {
    const light = addMetaTag('light');
    const dark = addMetaTag('dark');
    const { rerender } = renderHook(
      ({ preference }: { preference: ThemePreference }) => useThemeColorMeta(preference),
      { initialProps: { preference: 'dark' } }
    );
    expect(light.content).toBe(THEME_COLOR.dark);
    expect(dark.content).toBe(THEME_COLOR.dark);

    rerender({ preference: 'light' });
    expect(light.content).toBe(THEME_COLOR.light);
    expect(dark.content).toBe(THEME_COLOR.light);

    rerender({ preference: 'system' });
    expect(light.content).toBe(THEME_COLOR.light);
    expect(dark.content).toBe(THEME_COLOR.dark);
  });

  it('does nothing, without throwing, when no theme-color meta tag exists', () => {
    expect(() => {
      renderHook(() => useThemeColorMeta('dark'));
    }).not.toThrow();
  });
});

describe('theme-color matches the bar surface', () => {
  it('equals --l/--d-material-solid in App.css', () => {
    expect(tokenValue('l-material-solid')).toBe(THEME_COLOR.light);
    expect(tokenValue('d-material-solid')).toBe(THEME_COLOR.dark);
  });

  it('ships in index.html as one tag per colour scheme, with the same values', () => {
    const tags = indexHtml.match(/<meta name="theme-color"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    expect(tags.find((tag) => tag.includes('(prefers-color-scheme: light)'))).toContain(
      `content="${THEME_COLOR.light}"`
    );
    expect(tags.find((tag) => tag.includes('(prefers-color-scheme: dark)'))).toContain(
      `content="${THEME_COLOR.dark}"`
    );
  });
});
