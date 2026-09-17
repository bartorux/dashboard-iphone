import { describe, it, expect } from 'vitest';
import app from '../App.tsx?raw';
import css from '../App.css?raw';
import chartSection from '../components/ChartSection.tsx?raw';

/**
 * Source-level, like settingsWiring and newsWiring: App has no render harness,
 * and the rules that make this feature desktop-only live in CSS, where no unit
 * test can reach them either.
 */
describe('layout wiring in App', () => {
  it('marks every switchable card, and nothing else', () => {
    for (const id of ['margin', 'summary', 'news', 'mix', 'trends']) {
      expect(app).toContain(`data-card="${id}" data-hidden={cardHidden('${id}')}`);
    }
    // The chart column is not on the list: the alerts' day axis is aligned to
    // the chart's plot area, and a dashboard without it is not this app.
    expect(app).not.toContain('data-card="chart"');
  });

  it('lets the grid know which columns still have something in them', () => {
    expect(app).toContain('<div className="dash-grid" data-cols={cols}>');
    expect(app).toContain('const cols = columnsState(layout);');
  });

  it('keeps the refresh button in a cell of its own, so a dropped column cannot take it', () => {
    expect(app).toContain('data-cell="actions"');
    expect(app).toMatch(/\{showRefreshButton && \(\s*<button/);
  });

  it('hands the settings the layout and its three ways of changing it', () => {
    expect(app).toContain('layout={layout}');
    expect(app).toContain('onToggleCard={toggleCard}');
    expect(app).toContain('onChartChange={setChart}');
    expect(app).toContain('onLayoutReset={resetLayout}');
  });
});

describe('the rules that keep this off the phone', () => {
  /**
   * The guarantee is structural, not pictorial: below 80rem these rules are not
   * declared at all, so no stored layout can reach a phone. Screenshots are the
   * second line, not the first.
   */
  function insideDesktopQuery(needle: string): boolean {
    const blocks = css.split('@media (min-width: 80rem) {');
    return blocks.slice(1).some((block) => block.split('\n@media')[0].includes(needle));
  }

  it('declares hiding, cell placement and the column variants only from 80rem', () => {
    expect(insideDesktopQuery('[data-card][data-hidden="true"]')).toBe(true);
    expect(insideDesktopQuery('[data-cell="answer"]')).toBe(true);
    expect(insideDesktopQuery('.dash-grid[data-cols="none"]')).toBe(true);
  });

  it('gives a card wrapper no box of its own below that width', () => {
    expect(css).toMatch(/\[data-card\]\s*\{\s*display: contents;/);
  });

  it('keeps the reader\'s chart size out of the phone\'s reach', () => {
    expect(insideDesktopQuery(':root[data-chart="tall"]')).toBe(true);
    expect(css).toMatch(/:root\s*\{\s*--chart-vh: 45;/);
  });

  it('derives the chart column from the chart height, so the two cannot drift', () => {
    expect(css).toContain('grid-template-columns: minmax(0, calc(var(--chart-vh) * 1.6vh))');
    expect(css).toContain('height: calc(var(--chart-vh) * 1vh)');
  });
});

describe('the chart tab is remembered', () => {
  it('reads and writes it as a choice, not as a fresh piece of state', () => {
    expect(chartSection).toContain("usePersistentChoice<ChartView>(\n    'chart-view',");
    expect(chartSection).not.toContain("useState<ChartView>('reserve')");
  });
});
