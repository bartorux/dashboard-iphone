import { describe, it, expect } from 'vitest';
import { buildSparklinePath } from '../Sparkline';

/*
 * Tested against the pure geometry builder, not the mounted component: the
 * component only measures its own box via ResizeObserver, and the jsdom stub
 * in src/test/setup.ts is a no-op that never invokes the callback — a
 * component-level render would always see width=0 and never build a path at
 * all.
 */
describe('buildSparklinePath — przerwa przy braku danych', () => {
  /*
   * A missing hour must break the path (a fresh "M") rather than being bridged
   * with an "L" straight to the next known point. Interpolating across the gap
   * would draw a reading PSE never published, in the same de-emphasis grey as
   * the readings it did — and there is no legend, tooltip or axis on a mark
   * this small to correct the impression.
   */
  it('starts a new subpath after a null instead of drawing a line across it', () => {
    const geometry = buildSparklinePath([100, null, 300, 400], null, 200, 40);

    expect(geometry).not.toBeNull();
    // One "M" for the point before the gap, a second "M" for the run after it.
    const moveCount = (geometry!.d.match(/M/g) ?? []).length;
    expect(moveCount).toBe(2);
    // Never an "L" leading out of the point immediately before the gap into
    // the point immediately after it — the mutation this guards against
    // (bridging null with the previous value instead of lifting the pen).
    expect(geometry!.d.startsWith('M')).toBe(true);
  });

  it('draws one unbroken subpath when there is no gap at all', () => {
    const geometry = buildSparklinePath([100, 200, 300, 400], null, 200, 40);

    const moveCount = (geometry!.d.match(/M/g) ?? []).length;
    expect(moveCount).toBe(1);
  });

  it('returns null rather than a flat guess when fewer than two readings survive', () => {
    expect(buildSparklinePath([null, null, 5, null], null, 200, 40)).toBeNull();
  });
});

describe('buildSparklinePath — kropka tylko przy podanym indeksie', () => {
  it('places no dot when dotIndex is null', () => {
    const geometry = buildSparklinePath([100, 200, 300], null, 200, 40);
    expect(geometry!.dot).toBeNull();
  });

  it('places the dot only at the requested index, not at every point', () => {
    const atFirst = buildSparklinePath([100, 200, 300], 0, 200, 40);
    const atLast = buildSparklinePath([100, 200, 300], 2, 200, 40);

    expect(atFirst!.dot).not.toBeNull();
    expect(atLast!.dot).not.toBeNull();
    // Different indices must land at different x — proof the dot tracks the
    // requested index rather than always defaulting to (say) the first or
    // last point regardless of what was asked for.
    expect(atFirst!.dot!.x).not.toBe(atLast!.dot!.x);
  });

  it('omits the dot when the requested index itself has no reading', () => {
    const geometry = buildSparklinePath([100, null, 300], 1, 200, 40);
    expect(geometry!.dot).toBeNull();
  });

  it('omits the dot when the index is out of range', () => {
    const geometry = buildSparklinePath([100, 200, 300], 99, 200, 40);
    expect(geometry!.dot).toBeNull();
  });
});
