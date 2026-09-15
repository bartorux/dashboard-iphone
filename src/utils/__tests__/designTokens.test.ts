import { describe, it, expect } from 'vitest';
// `?raw` (declared by vite/client, referenced in src/vite-env.d.ts) pulls the
// file in as a plain string through Vite's own pipeline — unlike `fs`, which
// this repo's tsconfig.json deliberately keeps out of `src` (see the comment
// on tsconfig.scripts.json) so the app is never compiled with Node globals
// in scope, test files included.
import css from '../../App.css?raw';

/*
 * Etap 2, naprawa D: --l-text-tertiary and --l-text-secondary were re-stepped
 * together (old tertiary #8e8e93 sat at 3.26:1 on white / 2.92:1 on
 * --surface-2, both under the 4.5:1 floor). --d-text-tertiary moved too, and
 * a --axis pair was split off so re-stepping tertiary could not, as a side
 * effect, move a chart pixel.
 */
function tokenValue(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found in App.css`);
  return match[1].trim();
}

describe('design tokens (etap 2, naprawa D)', () => {
  it('darkens light-mode tertiary and secondary text so both clear 4.5:1', () => {
    expect(tokenValue('l-text-tertiary')).toBe('#6e6e73');
    expect(tokenValue('l-text-secondary')).toBe('#545458');
  });

  it('lightens dark-mode tertiary text for the same floor', () => {
    expect(tokenValue('d-text-tertiary')).toBe('#98989d');
  });

  it('pins a dedicated axis token at the pre-D tertiary value in both themes, so no chart pixel moves', () => {
    expect(tokenValue('l-axis')).toBe('#8e8e93');
    expect(tokenValue('d-axis')).toBe('#8e8e93');
  });

  it('pins the header\'s "unknown" bar background independent of the retuned tertiary token', () => {
    // Both themes fixed at the grey "unknown" was verified at — once the
    // header's whole background, now the dot in its neutral capsule. If this
    // drifted with --text-tertiary, "unknown" would re-step with body text.
    expect(tokenValue('l-status-unknown')).toBe('#8e8e93');
    expect(tokenValue('d-status-unknown')).toBe('#8e8e93');
  });
});

/** The body of the first rule whose selector is exactly `selector`, inside `scope`. */
function ruleBody(scope: string, selector: string): string {
  const idx = scope.indexOf(`${selector} {`);
  if (idx === -1) throw new Error(`rule not found: ${selector}`);
  const open = scope.indexOf('{', idx);
  return scope.slice(open + 1, scope.indexOf('}', open));
}

/** The text of an at-rule block such as `@media (...)`, braces balanced. */
function atBlock(prelude: string): string {
  const idx = css.indexOf(prelude);
  if (idx === -1) throw new Error(`block not found: ${prelude}`);
  const open = css.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced block: ${prelude}`);
}

describe('app bar material', () => {
  it('declares the material tokens in all four places: pair, light, system dark, forced dark, theme', () => {
    expect(tokenValue('l-material')).toMatch(/^rgba\(/);
    expect(tokenValue('d-material')).toMatch(/^rgba\(/);

    const lightAliases = ruleBody(css, ':root');
    expect(lightAliases).toMatch(/--material:\s*var\(--l-material\);/);
    expect(lightAliases).toMatch(/--material-solid:\s*var\(--l-material-solid\);/);

    const systemDark = atBlock('@media (prefers-color-scheme: dark)');
    expect(systemDark).toMatch(/--material:\s*var\(--d-material\);/);
    expect(systemDark).toMatch(/--material-solid:\s*var\(--d-material-solid\);/);

    const forcedDark = ruleBody(css, ':root[data-theme="dark"]');
    expect(forcedDark).toMatch(/--material:\s*var\(--d-material\);/);
    expect(forcedDark).toMatch(/--material-solid:\s*var\(--d-material-solid\);/);

    const theme = atBlock('@theme inline');
    expect(theme).toMatch(/--color-material:\s*var\(--material\);/);
    expect(theme).toMatch(/--color-material-solid:\s*var\(--material-solid\);/);
  });

  it('is translucent and blurred by default, with a neutral hairline', () => {
    const bar = ruleBody(css, '.app-bar');
    expect(bar).toMatch(/background-color:\s*var\(--material\);/);
    expect(bar).toMatch(/(^|\s)backdrop-filter:\s*blur\(/);
    expect(bar).toMatch(/-webkit-backdrop-filter:\s*blur\(/);
    expect(bar).toMatch(/box-shadow:\s*inset 0 -1px 0 var\(--separator\);/);
  });

  it('puts the status colour only in a 3px line, one rule per status', () => {
    (['ok', 'warn', 'alarm'] as const).forEach((status) => {
      const rule = ruleBody(css, `.app-bar[data-status="${status}"]`);
      expect(rule.trim()).toBe(`box-shadow: inset 0 -3px 0 var(--${status});`);
    });
  });

  it('goes solid, without blur, under reduced transparency', () => {
    const bar = ruleBody(atBlock('@media (prefers-reduced-transparency: reduce)'), '.app-bar');
    expect(bar).toMatch(/background-color:\s*var\(--material-solid\);/);
    expect(bar).toMatch(/(^|\s)backdrop-filter:\s*none;/);
    expect(bar).toMatch(/-webkit-backdrop-filter:\s*none;/);
  });

  it('goes solid with a defined edge under increased contrast', () => {
    const bar = ruleBody(atBlock('@media (prefers-contrast: more)'), '.app-bar');
    expect(bar).toMatch(/background-color:\s*var\(--material-solid\);/);
    expect(bar).toMatch(/(^|\s)backdrop-filter:\s*none;/);
    expect(bar).toMatch(/box-shadow:\s*inset 0 -1px 0 var\(--text-tertiary\);/);
  });
});
