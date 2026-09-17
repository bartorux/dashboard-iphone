/**
 * Which cards the dashboard shows on a computer, and how tall the chart is.
 *
 * Desktop only: below 80rem nothing here reaches the page (see the rules in
 * App.css, all inside `@media (min-width: 80rem)`, and the settings section,
 * which is `hidden xl:block`). The phone keeps the layout its source order
 * gives it, whatever is stored here.
 *
 * Pure, like ceny.ts or sheetPhysics.ts: reading a stored value is the part
 * worth testing, and it has no business touching localStorage itself.
 */

/** The three chart sizes, as names. A number in storage would promise that 57 works too. */
export const CHART_SIZES = ['compact', 'standard', 'tall'] as const;
export type ChartSize = (typeof CHART_SIZES)[number];

/** How tall the chart is, in vh — the same number the grid multiplies by 1.6 for the column. */
export const CHART_VH: Record<ChartSize, number> = { compact: 45, standard: 52, tall: 60 };

export type CardId = 'margin' | 'summary' | 'news' | 'mix' | 'trends';
/** Which grid cell a card lives in: the answer (margin, analysis) or the readings (mix, trends). */
export type CardGroup = 'answer' | 'readings';

/**
 * The canonical list — order and membership both live here, never in storage.
 * A card added in a later version therefore appears by itself, in its place and
 * visible, without a migration or a new schema version.
 */
export const CARDS: { id: CardId; label: string; group: CardGroup }[] = [
  { id: 'margin', label: 'Bieżący margines', group: 'answer' },
  { id: 'summary', label: 'Analiza AI', group: 'answer' },
  { id: 'news', label: 'Z branży', group: 'answer' },
  { id: 'mix', label: 'Miks OZE', group: 'readings' },
  { id: 'trends', label: 'Analiza i trendy', group: 'readings' },
];

export const LAYOUT_VERSION = 1;

export interface Layout {
  version: number;
  chart: ChartSize;
  /** Card ids the reader has switched off. Everything not listed is shown. */
  hidden: CardId[];
}

export const DEFAULT_LAYOUT: Layout = { version: LAYOUT_VERSION, chart: 'standard', hidden: [] };

const CARD_IDS = new Set<string>(CARDS.map((card) => card.id));

/**
 * A stored value into a layout. Clamps rather than rejects, like useSettings:
 * a file from a newer version, a hand-edited key or a card that no longer
 * exists must cost at most that one field, never the whole configuration.
 */
export function readLayout(value: unknown): Layout {
  if (typeof value !== 'object' || value === null) return DEFAULT_LAYOUT;
  const record = value as Record<string, unknown>;
  if (record.version !== LAYOUT_VERSION) return DEFAULT_LAYOUT;

  const chart = CHART_SIZES.includes(record.chart as ChartSize) ? (record.chart as ChartSize) : DEFAULT_LAYOUT.chart;

  const hidden = Array.isArray(record.hidden)
    ? CARDS.map((card) => card.id).filter((id) => (record.hidden as unknown[]).includes(id))
    : [];

  return { version: LAYOUT_VERSION, chart, hidden };
}

export function isDefaultLayout(layout: Layout): boolean {
  return layout.chart === DEFAULT_LAYOUT.chart && layout.hidden.length === 0;
}

export function isCardHidden(layout: Layout, id: CardId): boolean {
  return layout.hidden.includes(id);
}

export function toggleCard(layout: Layout, id: CardId): Layout {
  if (!CARD_IDS.has(id)) return layout;
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((entry) => entry !== id)
    : CARDS.map((card) => card.id).filter((entry) => entry === id || layout.hidden.includes(entry));
  return { ...layout, hidden };
}

export function groupShown(layout: Layout, group: CardGroup): boolean {
  return CARDS.some((card) => card.group === group && !layout.hidden.includes(card.id));
}

/**
 * Which columns the grid should reserve. An empty column is the one bad state
 * this feature can produce, and it is prevented here rather than warned about:
 * the grid template follows this value.
 */
export type ColumnsState = 'both' | 'answer' | 'readings' | 'none';

export function columnsState(layout: Layout): ColumnsState {
  const answer = groupShown(layout, 'answer');
  const readings = groupShown(layout, 'readings');
  if (answer && readings) return 'both';
  if (answer) return 'answer';
  if (readings) return 'readings';
  return 'none';
}
