import type { NewsFile, NewsGroup, NewsGroupId, NewsItem } from './newsTypes';

/**
 * The part of "Z branży" both sides share: the file's shape, which rows the
 * card shows, how a time is written. Nothing here parses XML — that lives in
 * newsFeed.ts, which only the generator imports, so the browser bundle never
 * carries it.
 */

/** Reading order, and the order the file is written in. */
export const NEWS_GROUPS: { id: NewsGroupId; label: string }[] = [
  { id: 'sieci', label: 'Sieci' },
  { id: 'regulacje', label: 'Regulacje' },
  { id: 'energetyka', label: 'Energetyka' },
  { id: 'paliwa', label: 'Paliwa i gaz' },
];

/**
 * Past this the header says "nieaktualne". The generator reads the feeds every
 * two hours, so four hours is two runs missed in a row — one missed run is
 * ordinary Actions lateness and not worth a word.
 */
export const NEWS_STALE_MS = 4 * 60 * 60 * 1000;

/** Past this the card is not shown at all, like the AI summary. */
export const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Sources whose name is set in a heavier weight: the operator and the regulator. */
const OFFICIAL_SOURCES = new Set(['PSE', 'URE']);

export function isOfficialSource(source: string): boolean {
  return OFFICIAL_SOURCES.has(source);
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isItem(value: unknown): value is NewsItem {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id !== '' &&
    typeof record.title === 'string' &&
    record.title !== '' &&
    isHttpsUrl(record.url) &&
    typeof record.source === 'string' &&
    typeof record.publishedAt === 'string' &&
    !Number.isNaN(Date.parse(record.publishedAt))
  );
}

const GROUP_IDS = new Set<string>(NEWS_GROUPS.map((group) => group.id));

function isGroup(value: unknown): value is NewsGroup {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    GROUP_IDS.has(record.id) &&
    typeof record.label === 'string' &&
    Array.isArray(record.items)
  );
}

/**
 * The file as the browser may use it, or null.
 *
 * Lenient per item, strict per file: one malformed row (a feed that slipped an
 * http link through) is dropped rather than costing the reader the whole card,
 * but a file without its timestamp or groups is not a news file at all.
 */
export function readNewsFile(value: unknown): NewsFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.generatedAt !== 'string' || Number.isNaN(Date.parse(record.generatedAt))) {
    return null;
  }
  if (!Array.isArray(record.groups) || !record.groups.every(isGroup)) return null;
  const groups = (record.groups as NewsGroup[]).map((group) => ({
    ...group,
    items: (group.items as unknown[]).filter(isItem),
  }));
  if (groups.every((group) => group.items.length === 0)) return null;
  return { generatedAt: record.generatedAt, groups };
}

export interface NewsRow {
  item: NewsItem;
  group: NewsGroup;
}

/**
 * What the card lists.
 *
 * Laptop, two rows: the newest headline of all, then the newest from Sieci —
 * the group closest to what this dashboard is about. When those are the same
 * article, the second row is the next newest of all rather than a repeat.
 *
 * Monitor, four rows: the newest of each group, in reading order, skipping a
 * group with nothing in it.
 */
export function pickCardRows(file: NewsFile, variant: 'laptop' | 'monitor'): NewsRow[] {
  if (variant === 'monitor') {
    return file.groups
      .filter((group) => group.items.length > 0)
      .map((group) => ({ item: group.items[0], group }));
  }

  const all = file.groups
    .flatMap((group) => group.items.map((item) => ({ item, group })))
    .sort((a, b) => Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt));
  if (all.length === 0) return [];

  const first = all[0];
  const sieci = file.groups.find((group) => group.id === 'sieci');
  const fromSieci = sieci?.items[0];
  const second =
    fromSieci && fromSieci.id !== first.item.id
      ? { item: fromSieci, group: sieci! }
      : all.find((row) => row.item.id !== first.item.id);
  return second ? [first, second] : [first];
}

const pad = (value: number) => String(value).padStart(2, '0');

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * "17:12" today, "wczoraj 13:00" yesterday, "15.09" before that.
 *
 * Absolute rather than "2 godz. temu": the page is left open for hours, and a
 * relative time would be wrong until something re-rendered it.
 */
export function formatNewsTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (sameDay(date, now)) return clock;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `wczoraj ${clock}`;
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type NewsFreshness = 'fresh' | 'stale' | 'expired';

export function newsFreshness(file: NewsFile, now: Date): NewsFreshness {
  const age = now.getTime() - Date.parse(file.generatedAt);
  if (age > NEWS_MAX_AGE_MS) return 'expired';
  if (age > NEWS_STALE_MS) return 'stale';
  return 'fresh';
}

/** Distinct outlets in the file, in the order they first appear — the panel's footer. */
export function sourcesOf(file: NewsFile): string[] {
  const seen: string[] = [];
  for (const group of file.groups) {
    for (const item of group.items) {
      if (!seen.includes(item.source)) seen.push(item.source);
    }
  }
  return seen;
}
