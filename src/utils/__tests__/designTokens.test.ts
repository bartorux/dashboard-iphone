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
    // Both themes fixed at the value Header's black-ink contrast (naprawa C)
    // was measured against — if this drifted with --text-tertiary instead,
    // light mode would fall to #6e6e73 and black ink there is only 4.14:1.
    expect(tokenValue('l-status-unknown')).toBe('#8e8e93');
    expect(tokenValue('d-status-unknown')).toBe('#8e8e93');
  });
});
