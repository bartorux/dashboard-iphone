import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, the same technique compassIsolation.test.ts
// uses for App.tsx — see its comment for why this is safe under `css: false`.
import appSrc from '../App.tsx?raw';

/**
 * The exchange-plan caveat (see exchangePlan.ts and AlertsPanel's
 * `exchangeMissing` prop) is one sentence, in one place, driven by one
 * computation — never a status, never a threshold. App.tsx has no render
 * tests today (it pulls in a dozen hooks, `virtual:pwa-register/react`
 * included, that nothing in this suite mocks yet), so — like
 * compassIsolation.test.ts before it — this pins the wiring by reading the
 * source rather than rendering the tree.
 *
 * Extracts the exact `useMemo(...)` call by balancing parens from the marker
 * onward — a plain substring slice would either stop short (nested parens) or
 * run past the call into unrelated code below it.
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

/** The one self-closing JSX tag named `tagOpen`, e.g. `<AlertsPanel`. */
function extractJsxTag(src: string, tagOpen: string): string {
  const idx = src.indexOf(tagOpen);
  if (idx === -1) throw new Error(`tag not found: ${tagOpen}`);
  const end = src.indexOf('/>', idx);
  if (end === -1) throw new Error(`no self-closing end found for: ${tagOpen}`);
  return src.slice(idx, end + 2);
}

describe('Zastrzeżenie o niezaplanowanym saldzie wymiany — okablowanie w App', () => {
  it('liczy exchangeMissing z exchangePlanned(dayData) i hasReadings(dayData), nigdy z todayData', () => {
    const block = extractCall(appSrc, 'const exchangeMissing = useMemo(');
    expect(block).toMatch(/exchangePlanned\(dayData\)/);
    expect(block).toMatch(/hasReadings\(dayData\)/);
    // The day ON SCREEN, not the fixed date used for "now" — the same
    // distinction dayCompassRanges makes a few lines above it.
    expect(block).not.toMatch(/todayData/);
  });

  it('przekazuje exchangeMissing WYŁĄCZNIE do AlertsPanel — nie do naglowka ani karty stanu', () => {
    const alerts = extractJsxTag(appSrc, '<AlertsPanel');
    expect(alerts).toContain('exchangeMissing={exchangeMissing}');

    const header = extractJsxTag(appSrc, '<Header');
    expect(header).not.toMatch(/exchangeMissing/);

    const status = extractJsxTag(appSrc, '<CurrentStatusCard');
    expect(status).not.toMatch(/exchangeMissing/);

    // Exactly one place wires the prop at all.
    expect(appSrc.match(/exchangeMissing=\{exchangeMissing\}/g) ?? []).toHaveLength(1);
  });
});
