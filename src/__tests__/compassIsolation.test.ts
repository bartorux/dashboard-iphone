import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, the same technique designTokens.test.ts
// uses for App.css — see its comment for why this is safe under `css: false`.
import appSrc from '../App.tsx?raw';
import headerSrc from '../components/Header.tsx?raw';
import themeColorSrc from '../hooks/useThemeColorMeta.ts?raw';
import statusSrc from '../utils/status.ts?raw';

/**
 * Kompas Energetyczny PSE is a new, independent signal (see AlertsPanel /
 * CompassRows). Three things it must never touch, no matter how it is wired
 * up next: the header bar's colour, the app badge count, and the installed
 * PWA's theme-color. All three are driven by margin-alert data alone today;
 * these tests pin that fact as an assertion rather than a comment, so a
 * change that quietly folds the compass into any of them fails loudly here
 * instead of only showing up as an unrelated-looking pixel or count drift.
 *
 * Extracts the exact `useMemo(...)` call by balancing parens from the marker
 * onward — a plain substring slice would either stop short (nested parens)
 * or run past the call into unrelated code below it.
 */
function extractCall(src: string, marker: string): string {
  const markerIdx = src.indexOf(marker);
  if (markerIdx === -1) throw new Error(`marker not found: ${marker}`);
  const openIdx = markerIdx + marker.length - 1; // the "(" right after useMemo
  if (src[openIdx] !== '(') {
    throw new Error(`marker does not end just before "(": ${marker}`);
  }
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(markerIdx, i + 1);
    }
  }
  throw new Error(`unbalanced parens reading call: ${marker}`);
}

describe('Kompas nie dotyka trzech niezaleznych sygnalow', () => {
  it('nie zmienia koloru paska naglowka (getUpcomingStatus / STATUS_HEADER_BG)', () => {
    const block = extractCall(appSrc, 'const headerStatus = useMemo(');
    expect(block).not.toMatch(/compass/i);
    // Header.tsx itself — the component that actually paints STATUS_HEADER_BG
    // — must not know the word either.
    expect(headerSrc).not.toMatch(/compass/i);
  });

  it('nie wchodzi do odznaki aplikacji (horizonAlertCount)', () => {
    const block = extractCall(appSrc, 'const horizonAlertCount = useMemo(');
    expect(block).not.toMatch(/compass/i);
  });

  it('nie zmienia STATUS_THEME_COLOR', () => {
    expect(statusSrc).not.toMatch(/compass/i);
    expect(themeColorSrc).not.toMatch(/compass/i);
  });
});
