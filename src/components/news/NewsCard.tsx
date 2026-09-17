import React from 'react';
import { formatClock, formatNewsTime, isOfficialSource, pickCardRows } from '../../utils/news';
import type { NewsFile, NewsItem } from '../../utils/newsTypes';

export interface NewsCardProps {
  news: NewsFile;
  now: Date;
  /** Two rows under 110rem, where the right column is full; one per group above it. */
  variant: 'laptop' | 'monitor';
  stale: boolean;
  isNew: (item: NewsItem) => boolean;
  /** The row the open panel came from, kept lit while it is open. */
  activeId: string | null;
  /** `null` opens the panel at the top ("Wszystkie"). */
  onOpen: (itemId: string | null) => void;
}

export const Source: React.FC<{ name: string }> = ({ name }) =>
  isOfficialSource(name) ? <span className="font-semibold text-text-secondary">{name}</span> : <>{name}</>;

/**
 * "Z branży": the newest industry headlines, a way into the panel that lists
 * them all. Desktop only (from 80rem) — see App.tsx for where it sits.
 *
 * A row opens the panel with that headline lit rather than the article
 * itself: two truncated titles are a glance, not enough to decide on, and the
 * panel shows the full title beside its neighbours. The article is one click
 * further, from there.
 *
 * No colour of its own. Green, orange and red are status here, blue is data,
 * indigo the threshold and magenta the compass; a headline is none of those.
 */
const NewsCard: React.FC<NewsCardProps> = ({ news, now, variant, stale, isNew, activeId, onOpen }) => {
  const rows = pickCardRows(news, variant);
  const fresh = news.groups.reduce((count, group) => count + group.items.filter(isNew).length, 0);
  const monitor = variant === 'monitor';

  return (
    <section aria-labelledby="news-card-title" className="mx-3 mt-3 hidden rounded-2xl bg-surface p-4 shadow-sm xl:block">
      <div className="flex items-center justify-between gap-2">
        <h2 id="news-card-title" className="min-w-0 truncate text-[0.6875rem] font-normal text-text-tertiary">
          {`Z branży · stan ${formatClock(news.generatedAt)}`}
          {stale && ', nieaktualne'}
          {!stale && fresh > 0 && <span className="text-text-secondary">{` · ${fresh > 9 ? '9+' : fresh} nowe`}</span>}
        </h2>
        <button
          type="button"
          aria-haspopup="dialog"
          data-news-all
          onClick={() => onOpen(null)}
          className="-my-1 -mr-1 shrink-0 rounded-md px-1 py-1 text-[0.8125rem] text-accent-text active:opacity-60"
        >
          Wszystkie ›
        </button>
      </div>

      <ul className="news-list mt-1">
        {rows.map(({ item, group }) => (
          <li key={item.id}>
            <button
              type="button"
              aria-haspopup="dialog"
              title={item.title}
              data-active={activeId === item.id}
              data-news-row={item.id}
              onClick={() => onOpen(item.id)}
              className={`news-row -mx-2 grid w-[calc(100%+1rem)] items-center gap-x-2.5 rounded-[0.625rem] px-2 text-left ${
                monitor ? 'min-h-11 grid-cols-[4.5rem_minmax(0,1fr)_auto]' : 'min-h-9 grid-cols-[minmax(0,1fr)_auto]'
              }`}
            >
              {monitor && <span className="text-[0.6875rem] font-semibold text-text-secondary">{group.label}</span>}
              <span className={`truncate text-[0.8125rem] text-text ${isNew(item) ? 'font-semibold' : 'font-normal'}`}>
                {item.title}
              </span>
              <span className="tnum whitespace-nowrap text-[0.6875rem] text-text-tertiary">
                <Source name={item.source} />
                {` · ${formatNewsTime(item.publishedAt, now)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default React.memo(NewsCard);
