import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SPRING_DISMISS, SPRING_PRESENT, SpringConfig, springAtRest, stepSpring } from '../../utils/sheetPhysics';
import { formatClock, formatNewsTime, sourcesOf } from '../../utils/news';
import type { NewsFile, NewsItem } from '../../utils/newsTypes';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Source } from './NewsCard';

export interface NewsSheetProps {
  open: boolean;
  news: NewsFile;
  now: Date;
  isNew: (item: NewsItem) => boolean;
  /** The headline the card row pointed at; lit and scrolled into view. */
  highlightId: string | null;
  onClose: () => void;
  onArticleOpen: (id: string) => void;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Reduced motion trades the slide for a cross-fade of this length, as the settings do. */
const FADE_S = 0.2;
/** A lit headline lands this far below the top of the list, with its neighbours above it. */
const HIGHLIGHT_TOP_PX = 96;
/** Rows shown per group before "Wszystkie". */
const COLLAPSED_ROWS = 2;

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const raf = (callback: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16);
const cancelRaf = (id: number) =>
  typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame(id) : clearTimeout(id);

/** The dashboard under the header, taken out of reach while the panel is open. */
const dashboard = () => document.querySelector('main');

/**
 * Every headline, grouped, in the settings' side panel.
 *
 * Same place, size and springs as the settings panel, and the two never show
 * together (App closes one when the other opens). Unlike the settings it dims
 * the dashboard under the header: the settings are adjusted against the chart
 * in full view, while this is reading beside it, and a click on the dim — the
 * natural way out — must not also switch a day tab underneath.
 *
 * Its own frame loop rather than the settings': that one also carries the
 * phone sheet, the drag and the receding page, none of which apply here, and
 * a panel that opens from a card on a desktop is no reason to rework it. The
 * physics are shared (sheetPhysics.ts); the dim's opacity is the panel's
 * progress, written in the same frame, so an interrupted open takes both back
 * together.
 */
const NewsSheet: React.FC<NewsSheetProps> = ({ open, news, now, isNew, highlightId, onClose, onArticleOpen }) => {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  const visible = open || mounted;

  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const offsetRef = useRef(0);
  const velocityRef = useRef(0);
  const opacityRef = useRef(1);
  const offsetTargetRef = useRef<number | null>(null);
  const opacityTargetRef = useRef(1);
  const springRef = useRef<SpringConfig>(SPRING_PRESENT);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const extent = useCallback(() => (panelRef.current ? panelRef.current.offsetWidth + 48 : 0), []);

  const paint = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const size = extent();
    const offset = offsetRef.current;
    const opacity = opacityRef.current;
    const progress = size > 0 ? Math.min(1, Math.max(0, 1 - offset / size)) : closingRef.current ? 0 : 1;
    panel.style.transform = `translate3d(${offset}px, 0, 0)`;
    panel.style.opacity = opacity < 1 ? String(opacity) : '';
    if (scrimRef.current) scrimRef.current.style.opacity = String(progress * opacity);
  }, [extent]);

  const tick = useCallback(
    (time: number) => {
      frameRef.current = null;
      const last = lastTimeRef.current ?? time;
      const dt = Math.max(0, (time - last) / 1000);
      lastTimeRef.current = time;

      let settled = true;
      const target = offsetTargetRef.current;
      if (target !== null) {
        const next = stepSpring({ position: offsetRef.current, velocity: velocityRef.current }, target, dt, springRef.current);
        if (springAtRest(next, target)) {
          offsetRef.current = target;
          velocityRef.current = 0;
          offsetTargetRef.current = null;
        } else {
          offsetRef.current = next.position;
          velocityRef.current = next.velocity;
          settled = false;
        }
      }

      const opacityTarget = opacityTargetRef.current;
      if (opacityRef.current !== opacityTarget) {
        const step = dt / FADE_S;
        const diff = opacityTarget - opacityRef.current;
        opacityRef.current = Math.abs(diff) <= step ? opacityTarget : opacityRef.current + Math.sign(diff) * step;
        if (opacityRef.current !== opacityTarget) settled = false;
      }

      paint();

      if (!settled) {
        frameRef.current = raf(tick);
        return;
      }
      lastTimeRef.current = null;
      if (closingRef.current) {
        closingRef.current = false;
        // Unmounting the list also folds any group the reader opened.
        setMounted(false);
      }
    },
    [paint]
  );

  const run = useCallback(() => {
    if (frameRef.current !== null) return;
    lastTimeRef.current = null;
    frameRef.current = raf(tick);
  }, [tick]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelRaf(frameRef.current);
    },
    []
  );

  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (!visible) return;
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setMounted(true);
      const fresh = !closingRef.current;
      closingRef.current = false;
      if (fresh) {
        // Safari does not focus a button on click, so the row it came from is
        // found by what the card marks on it — or the card's "Wszystkie".
        const active = document.activeElement;
        openerRef.current =
          active instanceof HTMLElement && active !== document.body
            ? active
            : document.querySelector<HTMLElement>(
                highlightId ? `.news-row[data-news-row="${highlightId}"]` : '[data-news-all]'
              );
        offsetRef.current = reducedRef.current ? 0 : extent();
        velocityRef.current = 0;
        opacityRef.current = reducedRef.current ? 0 : 1;
      }
      springRef.current = SPRING_PRESENT;
      offsetTargetRef.current = 0;
      opacityTargetRef.current = 1;
      paint();
      panelRef.current?.focus({ preventScroll: true });
      run();
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      closingRef.current = true;
      springRef.current = SPRING_DISMISS;
      if (reducedRef.current) {
        offsetTargetRef.current = null;
        opacityTargetRef.current = 0;
      } else {
        offsetTargetRef.current = extent();
        opacityTargetRef.current = 1;
      }
      // Home at once, not after the animation — see SettingsPanel. The page is
      // released first: an inert element refuses focus.
      dashboard()?.removeAttribute('inert');
      const active = document.activeElement;
      const ours = !active || active === document.body || panelRef.current?.contains(active);
      if (ours && openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
      run();
    }
    // highlightId is read only at the moment of opening, alongside `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visible, extent, paint, run]);

  // The lit headline, placed before the first frame is painted rather than
  // scrolled to where the reader would watch the list move.
  useLayoutEffect(() => {
    if (!open || !highlightId) return;
    const body = bodyRef.current;
    const row = body?.querySelector<HTMLElement>(`[data-news-id="${highlightId}"]`);
    if (!body || !row) return;
    const top = row.getBoundingClientRect().top - body.getBoundingClientRect().top;
    const bottom = top + row.offsetHeight;
    if (top < 0 || bottom > body.clientHeight) body.scrollTop += top - HIGHLIGHT_TOP_PX;
  }, [open, highlightId]);

  useEffect(() => {
    if (!open) return;
    const main = dashboard();
    main?.setAttribute('inert', '');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      main?.removeAttribute('inert');
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Tab stays inside the panel while it is open — see SettingsPanel for why every Tab is moved by hand. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    event.preventDefault();
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.tabIndex >= 0 && !element.closest('[inert]')
    );
    if (items.length === 0) return;
    const here = items.indexOf(document.activeElement as HTMLElement);
    const next =
      here === -1 ? (event.shiftKey ? items.length - 1 : 0) : (here + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
  };

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div ref={scrimRef} aria-hidden className="news-scrim" style={{ pointerEvents: open ? 'auto' : 'none' }} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        inert={!open || undefined}
        className="settings-side"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 pl-8 pr-4">
          <h2 id={titleId} className="text-[1.25rem] font-bold text-text">
            Z branży
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 min-h-11 rounded-lg px-2 text-[1.0625rem] font-semibold text-accent-text active:opacity-60"
          >
            Gotowe
          </button>
        </div>

        <div ref={bodyRef} className="settings-body">
          <NewsGroups
            news={news}
            now={now}
            isNew={isNew}
            highlightId={highlightId}
            onArticleOpen={onArticleOpen}
            idPrefix={titleId}
          />
        </div>
      </div>
    </>,
    document.body
  );
};

export interface NewsGroupsProps {
  news: NewsFile;
  now: Date;
  isNew: (item: NewsItem) => boolean;
  highlightId: string | null;
  onArticleOpen: (id: string) => void;
  /** Unique per panel; the group headings and their folded rows are named from it. */
  idPrefix: string;
}

/**
 * The grouped list inside the panel, and its footer.
 *
 * Its own component so the phone sheet of the experiment (ArkuszTelefon, see
 * useNewsExperiment) shows the very same list rather than a copy that could
 * drift from it while the variants are being tried. Which group is unfolded
 * lives here: unmounting the list with its panel folds them all again.
 */
export const NewsGroups: React.FC<NewsGroupsProps> = ({ news, now, isNew, highlightId, onArticleOpen, idPrefix }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const row = (item: NewsItem) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-news-id={item.id}
      data-hit={item.id === highlightId}
      onClick={() => onArticleOpen(item.id)}
      className="news-sheet-row grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-4 py-2.5 text-left"
    >
      <span className={`line-clamp-2 text-[0.9375rem] leading-snug text-text ${isNew(item) ? 'font-semibold' : 'font-normal'}`}>
        {item.title}
      </span>
      <span className="tnum whitespace-nowrap pt-0.5 text-[0.75rem] text-text-tertiary">{formatNewsTime(item.publishedAt, now)}</span>
      <span className="col-span-2 mt-0.5 flex items-center gap-1 text-[0.75rem] text-text-tertiary">
        <Source name={item.source} />
        <svg aria-hidden viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 2h4.5v4.5M8 2L2 8" />
        </svg>
        <span className="sr-only">(otwiera nową kartę)</span>
      </span>
    </a>
  );

  return (
    <>
      {news.groups
        .filter((group) => group.items.length > 0)
        .map((group) => {
          const headId = `${idPrefix}-${group.id}`;
          const restId = `${idPrefix}-${group.id}-rest`;
          const more = group.items.length > COLLAPSED_ROWS;
          const isOpen = expanded === group.id;
          return (
            <section key={group.id} aria-labelledby={headId}>
              {/* Stays at the top while its own rows scroll under it, so a long
                  open group never loses its name. Opaque, not a material. */}
              <div className="sticky top-0 z-[1] flex items-baseline justify-between bg-sheet-bg px-8 pb-1.5 pt-4">
                <h3 id={headId} className="text-[0.8125rem] font-semibold text-text-secondary">
                  {`${group.label} · ${group.items.length}`}
                </h3>
                {more && (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={restId}
                    onClick={() => setExpanded(isOpen ? null : group.id)}
                    className="-mr-1 rounded-md px-1 text-[0.8125rem] text-accent-text active:opacity-60"
                  >
                    {isOpen ? 'Mniej' : `Wszystkie (${group.items.length})`}
                  </button>
                )}
              </div>
              <div className="sheet-group mx-4 overflow-hidden rounded-xl bg-sheet-cell">
                {group.items.slice(0, COLLAPSED_ROWS).map(row)}
                {more && (
                  <div id={restId} className="collapsible" data-collapsed={!isOpen} inert={!isOpen || undefined}>
                    <div className="sheet-group">{group.items.slice(COLLAPSED_ROWS).map(row)}</div>
                  </div>
                )}
              </div>
            </section>
          );
        })}

      <p className="px-8 pt-5 text-[0.75rem] leading-snug text-text-tertiary">
        {`Źródła: ${sourcesOf(news).join(', ')} · pobrano ${formatClock(news.generatedAt)}`}
      </p>
    </>
  );
};

export default NewsSheet;
