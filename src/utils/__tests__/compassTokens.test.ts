import { describe, it, expect } from 'vitest';
// See designTokens.test.ts for why `?raw` is the way to read App.css's
// literal values in a test.
import css from '../../App.css?raw';

function tokenValue(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found in App.css`);
  return match[1].trim();
}

describe('Kompas Energetyczny PSE — tokeny barwy (etap 3)', () => {
  it('pins the raw compass hex/rgba pair — measured 5.86:1 (light) / 6.75:1 (dark)', () => {
    expect(tokenValue('l-compass')).toBe('#b5179e');
    expect(tokenValue('d-compass')).toBe('#ff70c0');
    expect(tokenValue('l-compass-soft')).toBe('rgba(181, 23, 158, 0.10)');
    expect(tokenValue('d-compass-soft')).toBe('rgba(255, 112, 192, 0.16)');
  });

  it('wires --compass/--compass-soft to the light pair in the base (system) alias block', () => {
    // The FIRST `--compass:` / `--compass-soft:` occurrence in the file is the
    // un-guarded :root block, which is what an OS in light mode (or no
    // preference at all) actually uses.
    const compassAliases = [...css.matchAll(/--compass: var\(--([ld])-compass\);/g)];
    const softAliases = [...css.matchAll(/--compass-soft: var\(--([ld])-compass-soft\);/g)];
    expect(compassAliases.map((m) => m[1])).toEqual(['l', 'd', 'd']);
    expect(softAliases.map((m) => m[1])).toEqual(['l', 'd', 'd']);
  });

  it('exposes bg-compass / text-compass / bg-compass-soft via @theme inline', () => {
    const themeBlock = css.slice(css.indexOf('@theme inline'));
    expect(themeBlock).toMatch(/--color-compass:\s*var\(--compass\);/);
    expect(themeBlock).toMatch(/--color-compass-soft:\s*var\(--compass-soft\);/);
  });
});
