import React, { useEffect, useId, useRef } from 'react';
import { formatClock, formatNewsTime, pickCardRows } from '../../../utils/news';
import { Source } from '../NewsCard';
import { countNew, newLabel, type WejscieProps } from './wspolne';

/**
 * "Z branży" as three headlines under the AI summary, with nothing to open —
 * the "gora" variant of the experiment (useNewsExperiment). Which three:
 * pickCardRows, 'telefon'.
 *
 * Each row is the article itself. On the desktop card a row opens the panel,
 * because there the panel is one click away and shows the full title; here
 * there is no panel, so the title gets two lines and the tap goes straight
 * out.
 *
 * With no panel to close, a visit ends when the reader leaves the page — to
 * an article, to another app. Everything was in view by then: the section
 * sits under the summary, near the top of the screen.
 */
const SekcjaGora: React.FC<WejscieProps> = ({ news, now, stale, isNew, onArticleOpen, onSeen }) => {
  const headingId = useId();
  const rows = pickCardRows(news, 'telefon');
  const fresh = countNew(news, isNew);

  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) onSeenRef.current();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return (
    <section
      aria-labelledby={headingId}
      data-z-branzy-sekcja
      className="mx-3 mt-3 rounded-2xl bg-surface px-4 pb-1.5 pt-3 shadow-sm"
    >
      <h2 id={headingId} className="truncate text-[0.6875rem] font-normal text-text-tertiary">
        {`Z branży · stan ${formatClock(news.generatedAt)}`}
        {stale && ', nieaktualne'}
        {!stale && fresh > 0 && <span className="text-text-secondary">{` · ${newLabel(fresh)}`}</span>}
      </h2>

      <ul className="news-list mt-1">
        {rows.map(({ item, group }) => (
          <li key={item.id}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onArticleOpen(item.id)}
              className="news-row -mx-2 block rounded-[0.625rem] px-2 py-2.5"
            >
              <span
                className={`line-clamp-2 text-[0.9375rem] leading-snug text-text ${isNew(item) ? 'font-semibold' : 'font-normal'}`}
              >
                {item.title}
              </span>
              <span className="tnum mt-0.5 flex items-center gap-1 text-[0.75rem] text-text-tertiary">
                <span className="text-text-secondary">{group.label}</span>
                <span aria-hidden>·</span>
                <Source name={item.source} />
                <span aria-hidden>·</span>
                {formatNewsTime(item.publishedAt, now)}
                <svg
                  aria-hidden
                  viewBox="0 0 10 10"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.5 2h4.5v4.5M8 2L2 8" />
                </svg>
                <span className="sr-only">(otwiera nową kartę)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SekcjaGora;
