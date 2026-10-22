import type { NewsFile, NewsItem } from '../../../utils/newsTypes';

/** What App hands the phone's "Z branży" row (WierszZBranzy). */
export interface WejscieProps {
  news: NewsFile;
  now: Date;
  /** Past four hours: the row says "nieaktualne", as the desktop card does. */
  stale: boolean;
  isNew: (item: NewsItem) => boolean;
  onArticleOpen: (id: string) => void;
  /** The reader has looked: the sheet was closed. */
  onSeen: () => void;
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
