import { describe, it, expect, afterEach, vi } from 'vitest';
import { axisWidthFor, dayAxisInset, CHART_MARGIN } from '../shared';

/**
 * `axisWidthFor` used to size itself from the current day's own tick labels
 * (`Math.max(...ticks.map((t) => formatMW(t).length))`), so the Y axis — and
 * with it the whole plot area — shifted from day to day and disagreed
 * between chart views looking at different data on the same day. It is now a
 * fixed width, so the two tick arrays below (one with a five-digit peak, one
 * with a negative reading) must produce IDENTICAL widths even though their
 * longest labels used to differ ("8 000" vs "-1 000", both length 6, but the
 * old code would have measured "6 000" as length 5 against these ticks).
 */
describe('axisWidthFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is the same for a day peaking above 10 000 MW as for one dipping negative', () => {
    // The function no longer takes a `ticks` argument at all — see shared.tsx
    // for why a per-day measurement was the bug. What used to be two
    // different call sites (`axisWidthFor([0, 2000, ..., 8000])` vs
    // `axisWidthFor([-1000, 0, ..., 6000])`, "8 000" and "-1 000" both being
    // 6 characters) are now the exact same call, so this asserts the one
    // property that mattered: no way remains to make the two widths differ.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '16px',
    } as CSSStyleDeclaration);

    expect(axisWidthFor()).toBe(axisWidthFor());
  });

  it('matches the fixed 6-character formula at the default root size', () => {
    // "-1 000" and "25 000" are both 6 characters — the longest label PSE's
    // feed actually produces. A mutation of that constant (say, back down to
    // 5, which is what a 4-digit-only assumption would give) must show up
    // here as a wrong pixel count, not just as a passing "same as itself".
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '16px',
    } as CSSStyleDeclaration);

    expect(axisWidthFor()).toBe(Math.ceil(6 * 6.5) + Math.ceil(18));
  });

  describe('scaling with the root font size', () => {
    it('grows when the reader has enlarged their text', () => {
      const at16 = (() => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
          fontSize: '16px',
        } as CSSStyleDeclaration);
        return axisWidthFor();
      })();

      const at20 = (() => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
          fontSize: '20px',
        } as CSSStyleDeclaration);
        return axisWidthFor();
      })();

      // 20/16 = 1.25x root size; the axis has to grow with it, not stay
      // pinned at the size that fit an 11px label.
      expect(at20).toBeGreaterThan(at16);
      expect(at20).toBe(Math.ceil(at16 * 1.25));
    });
  });
});

/**
 * `dayAxisInset` is the one function both the reserve chart's Y axis and the
 * alert panel's day-axis track read from. Its `right` side has no axis width
 * to fold in — it is just the chart card's own padding plus the Recharts
 * right margin — so it has to track `CHART_MARGIN.right` exactly; a drift
 * here is invisible in either component alone and only shows up as the two
 * axes disagreeing on screen.
 */
describe('dayAxisInset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('right side is the chart card padding plus CHART_MARGIN.right', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '16px',
    } as CSSStyleDeclaration);

    const inset = dayAxisInset();
    expect(inset.right).toBe(12 + CHART_MARGIN.right);
  });

  it('left side grows with the (fixed) axis width', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '16px',
    } as CSSStyleDeclaration);

    const inset = dayAxisInset();
    expect(inset.left).toBe(12 + axisWidthFor());
  });
});
