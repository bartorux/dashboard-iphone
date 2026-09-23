import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, as in exchangeMissingWiring.test.ts.
import generatorSrc from '../../scripts/summary.ts?raw';

/**
 * The checks in `validateSummary` that need to know WHICH day carries a Kompas
 * flag, and the exchange caveat `withSaldoCaveat` appends, run only when the
 * caller hands them the facts per day — without them they are skipped,
 * silently, and every unit test still passes. The generator is a top-level script with network
 * calls and no render path to test, so the one link that makes the gate real
 * is pinned by reading its source.
 */
describe('generator passes the facts per day to the gate', () => {
  it('calls validateSummary with the facts as its fourth argument', () => {
    const calls = generatorSrc.match(/validateSummary\(([^)]*)\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/validateSummary\(\s*parsed\s*,\s*allowedHours\s*,\s*allowedDayNames\s*,\s*facts\s*\)/);
  });

  it('writes the summary through withSaldoCaveat with the same facts', () => {
    expect(generatorSrc).toMatch(/const summary = withSaldoCaveat\(\s*wynik\.summary\s*,\s*facts\s*\)/);
    expect(generatorSrc).not.toMatch(/const summary = wynik\.summary;/);
  });
});
