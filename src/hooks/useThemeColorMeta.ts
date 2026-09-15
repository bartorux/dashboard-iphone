import { useEffect } from 'react';
import type { ThemePreference } from './useTheme';

/**
 * The app bar's solid surface per theme — `--l-material-solid` /
 * `--d-material-solid` in App.css, repeated here because <meta> cannot take a
 * CSS variable. A test holds App.css, index.html and this map equal.
 */
export const THEME_COLOR = {
  light: '#f8f8fa',
  dark: '#121214',
} as const;

/**
 * Keep <meta name="theme-color"> on the app bar's surface for the theme on
 * screen, so the browser's own chrome continues the bar instead of framing it.
 *
 * It used to follow the status colour, which matched the old full-colour bar.
 * The bar is a translucent surface now, and an orange strip above a grey bar
 * would read as a third, unexplained element.
 *
 * index.html carries two tags, one per `prefers-color-scheme`, so "system"
 * needs no script at all. A theme chosen in the settings overrides the system,
 * which a media query cannot know about: both tags then carry the chosen
 * theme's colour, whichever of them the browser happens to match.
 *
 * Note for installed iOS home-screen apps: the status bar style is captured at
 * install time, so an already-installed instance may keep the colour it was
 * added with. The UI must not depend on this taking effect.
 */
export function useThemeColorMeta(preference: ThemePreference): void {
  useEffect(() => {
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        const scheme = (meta.getAttribute('media') ?? '').includes('dark')
          ? 'dark'
          : 'light';
        meta.content = THEME_COLOR[preference === 'system' ? scheme : preference];
      });
  }, [preference]);
}
