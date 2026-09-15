import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, the same technique compassIsolation.test.ts
// uses for App.tsx — App has no render tests (see exchangeMissingWiring.test.ts).
import appSrc from '../App.tsx?raw';

/**
 * The header carried `sticky top-0` for months and never stuck: its parent had
 * `overflow-x-hidden`, which computes the other axis to `auto` and makes the
 * parent a scroll container, so the bar stuck to a box that never scrolled and
 * left the screen with the page. jsdom has no layout, so this pins the class
 * names that decide it; the behaviour itself was checked in Chromium and WebKit.
 * The bar's own `sticky top-0` is pinned by the Header render test.
 */
function classNameAfter(src: string, marker: string): string {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error(`marker not found: ${marker}`);
  const match = src.slice(idx).match(/className="([^"]*)"/);
  if (!match) throw new Error(`no className after: ${marker}`);
  return match[1];
}

const classes = (value: string) => value.split(/\s+/).filter(Boolean);

/** Anything that turns a box into a scroll container outside a @supports fallback. */
function scrollContainerClasses(value: string): string[] {
  return classes(value).filter(
    (name) =>
      /^overflow(-[xy])?-(hidden|auto|scroll)$/.test(name) &&
      // `overflow-x-hidden` is allowed only as the fallback for browsers that
      // do not know `clip`; the supports variant below replaces it everywhere else.
      !(name === 'overflow-x-hidden' && value.includes('supports-[overflow:clip]:overflow-x-clip'))
  );
}

describe('Przyklejony pasek', () => {
  it('korzeń aplikacji nie jest kontenerem przewijania, więc sticky działa', () => {
    const root = classNameAfter(appSrc, 'return (\n    <div');
    expect(classes(root)).toContain('supports-[overflow:clip]:overflow-x-clip');
    expect(scrollContainerClasses(root)).toEqual([]);
  });

  it('pasek jest dzieckiem korzenia, a nie elementu main', () => {
    const rootIdx = appSrc.indexOf('return (\n    <div');
    const headerIdx = appSrc.indexOf('<Header', rootIdx);
    const mainIdx = appSrc.indexOf('<main', rootIdx);
    expect(headerIdx).toBeGreaterThan(rootIdx);
    expect(headerIdx).toBeLessThan(mainIdx);
  });

  it('main też przycina bez tworzenia kontenera przewijania', () => {
    const main = classNameAfter(appSrc, '<main');
    expect(classes(main)).toContain('supports-[overflow:clip]:overflow-x-clip');
    expect(scrollContainerClasses(main)).toEqual([]);
  });
});
