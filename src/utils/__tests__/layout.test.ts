import { describe, it, expect } from 'vitest';
import {
  CARDS,
  CHART_VH,
  DEFAULT_LAYOUT,
  LAYOUT_VERSION,
  columnsState,
  isCardHidden,
  isDefaultLayout,
  readLayout,
  toggleCard,
} from '../layout';

const stored = (extra: Record<string, unknown>) => ({ version: LAYOUT_VERSION, chart: 'standard', hidden: [], ...extra });

describe('readLayout', () => {
  it('reads a well-formed layout', () => {
    expect(readLayout(stored({ chart: 'tall', hidden: ['news'] }))).toEqual({
      version: LAYOUT_VERSION,
      chart: 'tall',
      hidden: ['news'],
    });
  });

  it('falls back to defaults for nothing, rubbish, or another version', () => {
    expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(readLayout('{')).toEqual(DEFAULT_LAYOUT);
    expect(readLayout([])).toEqual(DEFAULT_LAYOUT);
    // Carrying real settings, so a version check that did nothing would show:
    // without it these would be read as a valid layout.
    expect(readLayout(stored({ version: 2, chart: 'tall', hidden: ['news'] }))).toEqual(DEFAULT_LAYOUT);
    expect(readLayout(stored({ version: undefined, chart: 'tall' }))).toEqual(DEFAULT_LAYOUT);
  });

  it('drops a card id it does not know, keeping the rest', () => {
    expect(readLayout(stored({ hidden: ['news', 'pogoda'] })).hidden).toEqual(['news']);
  });

  it('adds a card the store has never heard of — visible, in its place from the code', () => {
    // What ships when a later version introduces a card: nothing in storage
    // mentions it, and it must appear rather than wait for a migration.
    const layout = readLayout(stored({ hidden: ['trends'] }));
    for (const card of CARDS) {
      expect(isCardHidden(layout, card.id)).toBe(card.id === 'trends');
    }
  });

  it('keeps hidden in the canonical order, whatever order the store used', () => {
    expect(readLayout(stored({ hidden: ['trends', 'margin'] })).hidden).toEqual(['margin', 'trends']);
  });

  it('falls back to the standard chart for a size that is not one of the three', () => {
    expect(readLayout(stored({ chart: 'huge' })).chart).toBe('standard');
    expect(readLayout(stored({ chart: 60 })).chart).toBe('standard');
  });

  it('survives hidden being something other than a list', () => {
    expect(readLayout(stored({ hidden: 'news' })).hidden).toEqual([]);
  });
});

describe('toggleCard', () => {
  it('hides and shows one card at a time', () => {
    const hidden = toggleCard(DEFAULT_LAYOUT, 'mix');
    expect(hidden.hidden).toEqual(['mix']);
    expect(toggleCard(hidden, 'mix').hidden).toEqual([]);
  });

  it('keeps the canonical order when a second card goes', () => {
    const layout = toggleCard(toggleCard(DEFAULT_LAYOUT, 'trends'), 'summary');
    expect(layout.hidden).toEqual(['summary', 'trends']);
  });

  it('leaves the chart size alone', () => {
    expect(toggleCard({ ...DEFAULT_LAYOUT, chart: 'tall' }, 'news').chart).toBe('tall');
  });
});

describe('columnsState', () => {
  const hide = (...ids: Parameters<typeof toggleCard>[1][]) =>
    ids.reduce((layout, id) => toggleCard(layout, id), DEFAULT_LAYOUT);

  it('keeps both columns while either group still has a card', () => {
    expect(columnsState(DEFAULT_LAYOUT)).toBe('both');
    expect(columnsState(hide('margin', 'summary'))).toBe('both');
    expect(columnsState(hide('mix'))).toBe('both');
  });

  it('drops a column whose every card is switched off', () => {
    expect(columnsState(hide('mix', 'trends'))).toBe('answer');
    expect(columnsState(hide('margin', 'summary', 'news'))).toBe('readings');
  });

  it('reports the chart-only layout, which is a supported state', () => {
    expect(columnsState(hide('margin', 'summary', 'news', 'mix', 'trends'))).toBe('none');
  });
});

describe('the rest', () => {
  it('knows the default layout from any other', () => {
    expect(isDefaultLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(isDefaultLayout({ ...DEFAULT_LAYOUT, chart: 'compact' })).toBe(false);
    expect(isDefaultLayout(toggleCard(DEFAULT_LAYOUT, 'news'))).toBe(false);
  });

  it('gives each chart size the height the CSS multiplies by 1.6 for the column', () => {
    expect(CHART_VH).toEqual({ compact: 45, standard: 52, tall: 60 });
  });

  it('puts every card in a group, with an id used once', () => {
    expect(new Set(CARDS.map((card) => card.id)).size).toBe(CARDS.length);
    expect(CARDS.every((card) => card.group === 'answer' || card.group === 'readings')).toBe(true);
  });
});
