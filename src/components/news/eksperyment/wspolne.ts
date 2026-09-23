import type { NewsFile, NewsItem } from '../../../utils/newsTypes';

/**
 * What App hands each of the three ways into "Z branży" on a phone (see
 * useNewsExperiment). One shape for all three, so App picks a variant without
 * wiring each one differently.
 */
export interface WejscieProps {
  news: NewsFile;
  now: Date;
  /** Past four hours: the count gives way to "nieaktualne", as on the desktop card. */
  stale: boolean;
  isNew: (item: NewsItem) => boolean;
  onArticleOpen: (id: string) => void;
  /** The reader has looked: the sheet was closed, or ("gora") the page was left. */
  onSeen: () => void;
}

export function countNew(news: NewsFile, isNew: (item: NewsItem) => boolean): number {
  return news.groups.reduce((count, group) => count + group.items.filter(isNew).length, 0);
}

/**
 * "1 nowa", "3 nowe", "5 nowych", "9+ nowych" — the noun left out is
 * "wiadomość". Capped at nine like the desktop card: past that the number
 * stops telling the reader anything the word does not.
 */
export function newLabel(count: number): string {
  if (count > 9) return '9+ nowych';
  if (count === 1) return '1 nowa';
  if (count >= 2 && count <= 4) return `${count} nowe`;
  return `${count} nowych`;
}

/** Marks every way into the sheet, so focus can find its way back when the tap gave it none. */
export const OPENER_SELECTOR = '[data-z-branzy-otworz]';
