import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source — same technique as compassIsolation.test.ts
// and tabsShrinkWithColumn.test.ts: the class strings and the offset formula
// ARE the contract here, and a render test would need the real chart card
// above the alerts card on screen to prove pixel alignment at all.
import chartSectionSrc from '../components/ChartSection.tsx?raw';
import alertsPanelSrc from '../components/AlertsPanel.tsx?raw';

/**
 * The alerts card's day-axis track has to land at the same x as the chart
 * card's Y axis sitting above it, and the only fact connecting the two is
 * each card's own padding (see `dayAxisInset` in chart/shared.tsx). Changing
 * either card's padding class WITHOUT going through that function moves one
 * axis and not the other — the two day-axis strips on screen fall out of
 * register by however many pixels the padding changed by, exactly the 47-53px
 * bug this feature exists to fix (05.09.2026). These tests pin both halves of
 * that contract: the padding values `dayAxisInset` assumes, and that
 * AlertsPanel actually asks it rather than carrying its own guess.
 */
describe('day axis alignment contract', () => {
  it('chart card keeps p-3 (ChartSection.tsx)', () => {
    expect(chartSectionSrc).toContain('rounded-2xl bg-surface p-3 shadow-sm');
  });

  it('alerts card keeps p-4 (AlertsPanel.tsx)', () => {
    expect(alertsPanelSrc).toContain('rounded-2xl bg-surface p-4 shadow-sm');
  });

  it('AlertsPanel computes the track offset through dayAxisInset, not its own literal', () => {
    expect(alertsPanelSrc).toMatch(/import\s*\{[^}]*dayAxisInset[^}]*\}\s*from\s*'\.\/chart\/shared'/);

    // The subtraction has to read `inset.left/right - ALERTS_CARD_PADDING_PX`
    // — a symbolic offset, not a number worked out by hand and pasted in.
    expect(alertsPanelSrc).toMatch(
      /marginLeft:\s*Math\.max\(0,\s*inset\.left\s*-\s*ALERTS_CARD_PADDING_PX\)/
    );
    expect(alertsPanelSrc).toMatch(
      /marginRight:\s*Math\.max\(0,\s*inset\.right\s*-\s*ALERTS_CARD_PADDING_PX\)/
    );

    // No pixel number sneaked in beside it — if the offset is ever expressed
    // as `marginLeft: 53` (correct today, wrong the moment either card's
    // padding changes) this must fail.
    expect(alertsPanelSrc).not.toMatch(/margin(?:Left|Right):\s*\d/);
  });
});
