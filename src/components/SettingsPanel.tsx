import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SettingsContent, { SettingsContentProps } from './SettingsContent';
import {
  releaseVelocity,
  rubberband,
  shouldDismiss,
  SPRING_DISMISS,
  SPRING_PRESENT,
  SPRING_RETURN,
  SpringConfig,
  springAtRest,
  stepSpring,
} from '../utils/sheetPhysics';

/**
 * From 48rem the settings open as a panel on the right; below it, as a sheet
 * from the bottom.
 *
 * 48rem rather than 80rem because that is where this page already stops being a
 * phone (see .content-width in App.css): from there the content is a centred
 * column with glass on both sides, the pointer is as likely a mouse or a
 * trackpad as a finger, and a bottom sheet would stretch each row of a short
 * list across the whole window — the proportions the old panel was faulted for
 * on a monitor. A panel of 28rem beside the dashboard keeps its rows the length
 * they have on a phone. On a window between 48 and 80rem it covers the right of
 * the column; it has no scrim, so the page stays usable and the gear closes it.
 */
export const SIDE_PANEL_QUERY = '(min-width: 48rem)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** How far the dashboard shrinks at the moment the sheet is fully up. */
const RECEDE_SCALE = 0.06;
/** How much of the receding dashboard shows above the sheet. */
const RECEDE_PEEK_PX = 10;
/** Reduced motion trades every slide for a cross-fade of this length. */
const FADE_S = 0.2;
/** Travel before a press on the handle counts as a drag rather than a tap. */
const DRAG_SLOP_PX = 4;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true
  );
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

const raf = (callback: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16);
const cancelRaf = (id: number) =>
  typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame(id) : clearTimeout(id);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where focus goes back to. The element that had it when the panel opened —
 * normally the gear — but Safari does not focus a button on click, so the
 * active element there is <body>, and the gear is then found by its name. It
 * lives in Header, which hands this component nothing but the toggle.
 */
function findOpener(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  return document.querySelector<HTMLElement>('button[aria-label="Ustawienia"]');
}

/** The dashboard behind the sheet. Absent in unit tests, which render no #root. */
const appRoot = () => document.getElementById('root');

export interface SettingsPanelProps extends Omit<SettingsContentProps, 'active'> {
  open: boolean;
  onClose: () => void;
}

type Drag = {
  pointerId: number;
  startY: number;
  startOffset: number;
  moved: boolean;
  samples: { t: number; y: number }[];
};

/**
 * Settings: a sheet on a phone, a side panel from 48rem.
 *
 * Neither pushes the dashboard. The sheet sits over it, with the page receding
 * under a dim, the way iOS presents a modal task; the side panel floats beside
 * it with no dim, so a threshold changed there repaints the chart and the
 * alerts in plain view.
 *
 * Motion is driven here rather than by CSS transitions because the sheet can be
 * grabbed at any moment — while it is still rising, or after a flick that did
 * not quite dismiss it — and a transition cannot be picked up from where it is.
 * One position (px from rest) and one opacity feed every frame; springs move the
 * position, and a release hands its velocity on so there is no seam between the
 * finger and the animation.
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose, ...content }) => {
  const wide = useMediaQuery(SIDE_PANEL_QUERY);
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const titleId = useId();

  const [mounted, setMounted] = useState(open);
  const visible = open || mounted;

  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
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
  const dragRef = useRef<Drag | null>(null);
  const releaseVelocityRef = useRef<number | null>(null);
  const recedeOriginRef = useRef<{ y: number; shift: number } | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  /** Distance from rest to fully off screen. Zero where nothing is laid out (tests). */
  const extent = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return 0;
    return wideRef.current ? panel.offsetWidth + 48 : panel.offsetHeight;
  }, []);

  const clearRecede = useCallback(() => {
    const root = appRoot();
    recedeOriginRef.current = null;
    document.documentElement.removeAttribute('data-settings-sheet');
    if (!root) return;
    root.style.transform = '';
    root.style.transformOrigin = '';
    root.style.clipPath = '';
  }, []);

  /** Writes the current position and opacity to the page. Called on every frame. */
  const paint = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const size = extent();
    const offset = offsetRef.current;
    const opacity = opacityRef.current;
    const progress = size > 0 ? Math.min(1, Math.max(0, 1 - offset / size)) : closingRef.current ? 0 : 1;

    panel.style.transform = wideRef.current
      ? `translate3d(${offset}px, 0, 0)`
      : `translate3d(0, ${offset}px, 0)`;
    panel.style.opacity = opacity < 1 ? String(opacity) : '';

    if (wideRef.current) return;

    if (scrimRef.current) scrimRef.current.style.opacity = String(progress * opacity);

    // The dashboard recedes only as a motion; with reduced motion it stays put
    // and only the dim fades.
    const root = appRoot();
    if (!root || reducedRef.current) return;
    if (progress <= 0.001) {
      clearRecede();
      return;
    }
    if (!recedeOriginRef.current) {
      const top = panel.getBoundingClientRect().top - offset;
      const bottom = Math.max(0, root.offsetHeight - window.scrollY - window.innerHeight);
      recedeOriginRef.current = { y: window.scrollY, shift: Math.max(0, top - RECEDE_PEEK_PX) };
      document.documentElement.setAttribute('data-settings-sheet', '');
      root.style.transformOrigin = `50% ${window.scrollY}px`;
      // Clipped to what is on screen, so the rounded corners are the
      // viewport's and not the far ends of a page several screens long.
      root.style.clipPath = `inset(${window.scrollY}px 0 ${bottom}px 0 round 0.75rem)`;
    }
    const { shift } = recedeOriginRef.current;
    root.style.transform = `translate3d(0, ${shift * progress}px, 0) scale(${1 - RECEDE_SCALE * progress})`;
  }, [extent, clearRecede]);

  const finishClose = useCallback(() => {
    clearRecede();
    closingRef.current = false;
    setMounted(false);
  }, [clearRecede]);

  const tick = useCallback(
    (now: number) => {
      frameRef.current = null;
      const last = lastTimeRef.current ?? now;
      const dt = Math.max(0, (now - last) / 1000);
      lastTimeRef.current = now;

      let settled = true;
      const target = offsetTargetRef.current;
      if (target !== null) {
        const next = stepSpring(
          { position: offsetRef.current, velocity: velocityRef.current },
          target,
          dt,
          springRef.current
        );
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
      if (closingRef.current) finishClose();
    },
    [paint, finishClose]
  );

  const run = useCallback(() => {
    if (frameRef.current !== null) return;
    lastTimeRef.current = null;
    frameRef.current = raf(tick);
  }, [tick]);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelRaf(frameRef.current);
    frameRef.current = null;
    lastTimeRef.current = null;
  }, []);

  // Opening and closing. A layout effect, so the first frame of a fresh sheet is
  // painted off screen rather than flashing in place before it moves.
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (!visible) return;
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      // Stays rendered after `open` drops, until the way out has finished.
      setMounted(true);
      const fresh = !closingRef.current;
      closingRef.current = false;
      if (fresh) {
        openerRef.current = findOpener();
        offsetRef.current = reducedRef.current ? 0 : extent();
        velocityRef.current = 0;
        opacityRef.current = reducedRef.current ? 0 : 1;
      }
      // Reopened mid-close: carries on from wherever the sheet has got to.
      springRef.current = SPRING_PRESENT;
      offsetTargetRef.current = 0;
      opacityTargetRef.current = 1;
      paint();
      panelRef.current?.focus({ preventScroll: true });
      run();
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      closingRef.current = true;
      const released = releaseVelocityRef.current;
      releaseVelocityRef.current = null;
      if (released !== null) velocityRef.current = released;
      springRef.current = SPRING_DISMISS;
      if (reducedRef.current) {
        offsetTargetRef.current = null;
        opacityTargetRef.current = 0;
      } else {
        offsetTargetRef.current = extent();
        opacityTargetRef.current = 1;
      }

      // Focus goes home at once, not after the animation: the reader has
      // already moved on, and a keyboard user would otherwise be stranded in a
      // panel that is leaving. Only when focus is still ours — on a monitor the
      // reader may have clicked into the dashboard and left it there.
      // The page is still inert here — the modal effect lets go only after
      // this layout effect — and an inert element refuses focus, so it is
      // released first.
      const root = appRoot();
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      const active = document.activeElement;
      const ours = !active || active === document.body || panelRef.current?.contains(active);
      if (ours && openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });

      run();
    }
  }, [open, visible, extent, paint, run]);

  useEffect(() => () => {
    stop();
    clearRecede();
  }, [stop, clearRecede]);

  // Switching between sheet and side panel mid-way (a rotated tablet, a resized
  // window): drop the recede and paint the other layout at rest.
  const layoutWideRef = useRef(wide);
  useLayoutEffect(() => {
    if (layoutWideRef.current === wide) return;
    layoutWideRef.current = wide;
    if (!visible) return;
    clearRecede();
    if (!closingRef.current) {
      stop();
      offsetRef.current = 0;
      velocityRef.current = 0;
      offsetTargetRef.current = null;
      opacityRef.current = 1;
      opacityTargetRef.current = 1;
    }
    paint();
    if (closingRef.current) {
      offsetTargetRef.current = reducedRef.current ? null : extent();
      run();
    }
    // Only a change of layout is meant here, not every render while visible.
  }, [wide]);

  // The sheet is modal: the page behind is out of reach for focus, touch and
  // assistive technology, and does not scroll. The side panel is not.
  const modal = open && !wide;
  useEffect(() => {
    if (!modal) return;
    const root = appRoot();
    const html = document.documentElement;
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    const previousOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      html.style.overflow = previousOverflow;
    };
  }, [modal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // The dashboard's pull-to-refresh and day swipe listen on `document`. A drag
  // on the sheet, or across the dim, is not a request for either.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const swallow = (event: Event) => event.stopPropagation();
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
    types.forEach((type) => layer.addEventListener(type, swallow, { passive: true }));
    return () => types.forEach((type) => layer.removeEventListener(type, swallow));
  }, [visible, wide]);

  /**
   * Tab stays inside the sheet; nothing behind it is reachable anyway.
   *
   * Every Tab is moved by hand rather than only the one at either end. Safari
   * by default tabs between form fields alone, skipping buttons, so "is focus
   * on the last button?" never came true there — measured in WebKit, Tab from
   * the last field left the sheet for the browser's own controls.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || wide) return;
    const panel = panelRef.current;
    if (!panel) return;
    event.preventDefault();
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.tabIndex >= 0 && !element.closest('[hidden]')
    );
    if (items.length === 0) return;
    const here = items.indexOf(document.activeElement as HTMLElement);
    const next =
      here === -1
        ? event.shiftKey
          ? items.length - 1
          : 0
        : (here + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
  };

  /* ------------------------------------------------------------ drag to dismiss */

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (wide || !open || event.pointerType === 'mouse') return;
    if ((event.target as Element).closest('button')) return;
    // Caught mid-flight: the spring lets go and the finger takes over from the
    // sheet's position on screen, never from where it was heading.
    stop();
    offsetTargetRef.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offsetRef.current,
      moved: false,
      samples: [{ t: event.timeStamp, y: event.clientY }],
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const travel = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(travel) < DRAG_SLOP_PX) return;
    drag.moved = true;
    const raw = drag.startOffset + travel;
    // Down follows the finger 1:1; up past the top resists, since there is no
    // taller detent to reach.
    offsetRef.current = raw >= 0 ? raw : rubberband(raw, extent());
    drag.samples.push({ t: event.timeStamp, y: event.clientY });
    if (drag.samples.length > 8) drag.samples.shift();
    paint();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    drag.samples.push({ t: event.timeStamp, y: event.clientY });
    const velocity = cancelled ? 0 : releaseVelocity(drag.samples);

    if (!cancelled && drag.moved && shouldDismiss(offsetRef.current, velocity, extent())) {
      releaseVelocityRef.current = velocity;
      onCloseRef.current();
      return;
    }

    if (reducedRef.current) {
      // Nothing to spring back with: the sheet simply is where it belongs.
      offsetRef.current = 0;
      velocityRef.current = 0;
      paint();
      return;
    }
    velocityRef.current = velocity;
    springRef.current = SPRING_RETURN;
    offsetTargetRef.current = 0;
    run();
  };

  if (!visible || typeof document === 'undefined') return null;

  const header = wide ? (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 pl-8 pr-4">
      <h2 id={titleId} className="text-[1.25rem] font-bold text-text">
        Ustawienia
      </h2>
      <DoneButton onClick={onClose} />
    </div>
  ) : (
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
          Ustawienia
        </h2>
        <div className="justify-self-end">
          <DoneButton onClick={onClose} />
        </div>
      </div>
    </div>
  );

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={wide ? undefined : true}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      // A closing panel is on its way out; nothing in it should take a tap.
      inert={!open || undefined}
      className={wide ? 'settings-side' : 'settings-sheet'}
    >
      {header}
      <div className="settings-body">
        <SettingsContent {...content} active={open} />
      </div>
    </div>
  );

  return createPortal(
    <div ref={layerRef} className={wide ? 'contents' : 'settings-layer'}>
      {!wide && <div ref={scrimRef} aria-hidden className="settings-scrim" onClick={onClose} />}
      {panel}
    </div>,
    document.body
  );
};

const DoneButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="-mr-2 min-h-11 rounded-lg px-2 text-[1.0625rem] font-semibold text-accent-text active:opacity-60"
  >
    Gotowe
  </button>
);

export default SettingsPanel;
