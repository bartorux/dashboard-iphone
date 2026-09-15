import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, as in exchangeMissingWiring.test.ts — App
// has no render tests, so the wiring into Header is pinned from the source.
import appSrc from '../App.tsx?raw';

/** From `marker` to the first `}` that closes the object literal it opens. */
function extractObject(src: string, marker: string): string {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error(`marker not found: ${marker}`);
  const open = src.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading: ${marker}`);
}

function extractJsxTag(src: string, tagOpen: string): string {
  const idx = src.indexOf(tagOpen);
  if (idx === -1) throw new Error(`tag not found: ${tagOpen}`);
  return src.slice(idx, src.indexOf('/>', idx) + 2);
}

describe('Pasek — okablowanie w App', () => {
  it('druga linia paska nie powtarza tego, co mówi pierwsza', () => {
    const block = extractObject(appSrc, 'const connectionText = {');
    // Header words loading ("Pobieranie danych z PSE…") and failure ("Brak
    // połączenia z PSE") itself. The second line used to say both again.
    expect(block).not.toMatch(/Pobieranie/);
    expect(block).not.toMatch(/Brak danych/);
    expect(block).not.toMatch(/połącz/i);
  });

  it('przekazuje ponowienie do paska jako pełne odświeżenie', () => {
    expect(extractJsxTag(appSrc, '<Header')).toContain('onRetry={refreshAll}');
  });
});
