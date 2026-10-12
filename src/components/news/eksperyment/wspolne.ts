import type { NewsFile, NewsItem } from '../../../utils/newsTypes';

/**
 * What App hands each way into "Z branży" on a phone (see useNewsExperiment).
 * One shape for all of them, so App picks a variant without wiring each one
 * differently.
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

/**
 * The two outlets whose news can bear on the capacity market — the system
 * operator and the regulator — in that order.
 */
const AUTHORITIES = ['PSE', 'URE'] as const;

/**
 * Which of PSE and URE have something new, PSE first. By outlet, not by
 * group: Sieci also carries Wysokie Napięcie, and a press article is not a
 * reason to look up from the reserve.
 */
export function newFromAuthorities(news: NewsFile, isNew: (item: NewsItem) => boolean): string[] {
  return AUTHORITIES.filter((source) =>
    news.groups.some((group) => group.items.some((item) => item.source === source && isNew(item)))
  );
}

/** "PSE", "URE" or "PSE i URE". */
export function listNames(names: readonly string[]): string {
  return names.join(' i ');
}

/** Marks every way into the sheet, so focus can find its way back when the tap gave it none. */
export const OPENER_SELECTOR = '[data-z-branzy-otworz]';
