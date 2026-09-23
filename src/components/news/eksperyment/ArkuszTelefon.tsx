import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { releaseVelocity, rubberband, shouldDismiss } from '../../../utils/sheetPhysics';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { NewsFile, NewsItem } from '../../../utils/newsTypes';
import { NewsGroups } from '../NewsSheet';
import { OPENER_SELECTOR } from './wspolne';
import './eksperyment.css';

export interface ArkuszTelefonProps {
  open: boolean;
  news: NewsFile;
  now: Date;
  isNew: (item: NewsItem) => boolean;
  onClose: () => void;
  onArticleOpen: (id: string) => void;
}

/** The `.zb-sheet` way out in eksperyment.css; the sheet leaves the page once it is over. */
const CLOSE_MS = 320;
/** Travel before a press on the handle counts as a drag rather than a tap. */
const DRAG_SLOP_PX = 4;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The dashboard behind the sheet. Absent in unit tests that render no #root. */
const appRoot = () => document.getElementById('root');

/**
 * Where focus goes back to: the entry that had it, or — Safari does not focus
 * a button on click — the entry found by its mark.
 */
function findOpener(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  return document.querySelector<HTMLElement>(OPENER_SELECTOR);
}

type Drag = {
  pointerId: number;
  startY: number;
  offset: number;
  moved: boolean;
  samples: { t: number; y: number }[];
};

/**
 * Every headline, in a sheet from the bottom — the list behind the "pasek"
 * and "dol" variants of the experiment (useNewsExperiment).
 *
 * The settings sheet's frame and manners without its engine: the same layer,
 * dim, grabber and "Gotowe", the page out of reach behind it, Escape and a tap
 * on the dim to close, a drag down on the handle to dismiss. It moves by CSS
 * transition rather than springs, and the page does not recede. Enough to
 * judge whether the list belongs behind this entry; the variant that stays
 * gets the springs.
 *
 * The one part that is not optional is the touch shield. The dashboard's
 * pull-to-refresh listens on `document` and cancels a downward move at the
 * top of the page, so without it a pull on the list would start a refresh
 * and the list would never scroll.
 */
const ArkuszTelefon: React.FC<ArkuszTelefonProps> = ({ open, news, now, isNew, onClose, onArticleOpen }) => {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  // Lags `open` by one layout pass on the way in, so the closed position is
  // styled first and the change to open is a transition rather than a jump.
  const [shown, setShown] = useState(false);
  const visible = open || mounted;

  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const leaveRef = useRef<number | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      if (leaveRef.current !== null) {
        // Reopened on its way out: it turns back from where it is, and the
        // entry it first came from is still the one to return to.
        clearTimeout(leaveRef.current);
        leaveRef.current = null;
      } else {
        openerRef.current = findOpener();
      }
      setMounted(true);
      // A layout read: the closed position is styled before `shown` flips.
      panelRef.current?.getBoundingClientRect();
      setShown(true);
      panelRef.current?.focus({ preventScroll: true });
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      setShown(false);
      // Focus goes home at once, not after the way out — see SettingsPanel.
      // The page is released first: an inert element refuses focus, and the
      // modal effect below lets go only after this layout effect.
      const root = appRoot();
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      const active = document.activeElement;
      const ours = !active || active === document.body || panelRef.current?.contains(active);
      if (ours && openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
      leaveRef.current = window.setTimeout(
        () => {
          leaveRef.current = null;
          setMounted(false);
        },
        reducedRef.current ? 0 : CLOSE_MS
      );
    }
  }, [open]);

  useEffect(
    () => () => {
      if (leaveRef.current !== null) clearTimeout(leaveRef.current);
    },
    []
  );

  // Modal, as the settings sheet is: the page behind is out of reach for
  // focus, touch and assistive technology, and does not scroll.
  useEffect(() => {
    if (!open) return;
    const root = appRoot();
    const html = document.documentElement;
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    const previousOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      html.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The touch shield (see above). Pull-to-refresh and the day swipe listen on
  // `document`; nothing that starts on the sheet or the dim reaches them.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const swallow = (event: Event) => event.stopPropagation();
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
    types.forEach((type) => layer.addEventListener(type, swallow, { passive: true }));
    return () => types.forEach((type) => layer.removeEventListener(type, swallow));
  }, [visible]);

  /** Tab stays inside the sheet — see SettingsPanel for why every Tab is moved by hand. */
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

  /* ------------------------------------------------------------ drag to dismiss */

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!open || event.pointerType === 'mouse') return;
    if ((event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      offset: 0,
      moved: false,
      samples: [{ t: event.timeStamp, y: event.clientY }],
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const travel = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(travel) < DRAG_SLOP_PX) return;
    drag.moved = true;
    // Down follows the finger 1:1; up resists, there being nowhere higher to go.
    drag.offset = travel >= 0 ? travel : rubberband(travel, panel.offsetHeight);
    panel.style.transition = 'none';
    panel.style.transform = `translate3d(0, ${drag.offset}px, 0)`;
    drag.samples.push({ t: event.timeStamp, y: event.clientY });
    if (drag.samples.length > 8) drag.samples.shift();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    drag.samples.push({ t: event.timeStamp, y: event.clientY });
    const velocity = cancelled ? 0 : releaseVelocity(drag.samples);
    const panel = panelRef.current;
    // Handed back to the stylesheet, which carries the sheet from where the
    // finger left it: home, or out if the drag dismissed it.
    if (panel) {
      panel.style.transition = '';
      panel.style.transform = '';
    }
    if (!cancelled && drag.moved && shouldDismiss(drag.offset, velocity, panel?.offsetHeight ?? 0)) {
      onCloseRef.current();
    }
  };

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    // A closing sheet lets taps through at once, rather than holding the
    // page for the length of its way out.
    <div ref={layerRef} className="settings-layer" style={open ? undefined : { pointerEvents: 'none' }}>
      <div aria-hidden className="settings-scrim zb-scrim" data-open={shown} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        inert={!open || undefined}
        data-open={shown}
        className="settings-sheet zb-sheet"
      >
        <div
          className="settings-sheet-handle shrink-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => endDrag(event, false)}
          onPointerCancel={(event) => endDrag(event, true)}
        >
          <div aria-hidden className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-grabber" />
          <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center px-4">
            <span />
            <h2 id={titleId} className="text-[1.0625rem] font-semibold text-text">
              Z branży
            </h2>
            <div className="justify-self-end">
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 min-h-11 rounded-lg px-2 text-[1.0625rem] font-semibold text-accent-text active:opacity-60"
              >
                Gotowe
              </button>
            </div>
          </div>
        </div>

        <div className="settings-body">
          <NewsGroups news={news} now={now} isNew={isNew} highlightId={null} onArticleOpen={onArticleOpen} idPrefix={titleId} />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ArkuszTelefon;
