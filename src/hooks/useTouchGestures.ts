import { useState, useRef, useCallback, useEffect } from 'react';
import { PULL_THRESHOLD_PX } from '../utils/constants';

/** Movement before the gesture commits to an axis. */
const AXIS_LOCK_PX = 10;
/** Horizontal travel required to count as a day swipe. */
const SWIPE_THRESHOLD_PX = 60;
/** A swipe must be clearly sideways, not a diagonal drift while scrolling. */
const SWIPE_RATIO = 1.6;
/**
 * How long the spinner stays up at the very least.
 *
 * Long enough that a fast refresh reads as one rather than as a flicker, short
 * enough that nobody waits for it. Measured against the alternative it replaces:
 * a flat second added after the data had already landed.
 */
const MIN_SPINNER_MS = 400;

interface Options {
  onRefresh: () => Promise<void>;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

interface TouchGestures {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  isReady: boolean;
}

/**
 * Pull-to-refresh and swipe-between-days in one place.
 *
 * Deliberately a single hook: two of them listening on `document` would each
 * decide independently whether a touch belongs to them, and a diagonal drag
 * would satisfy both. Here the first ~10px of movement locks the gesture to one
 * axis and the other behaviour stays out of the way for the rest of the touch.
 */
export function useTouchGestures({
  onRefresh,
  onSwipeLeft,
  onSwipeRight,
}: Options): TouchGestures {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef<'x' | 'y' | null>(null);
  const draggingRef = useRef(false);
  const swipeAllowedRef = useRef(true);
  const isRefreshingRef = useRef(false);
  /*
   * The pull distance mirrored into a ref.
   *
   * `handleTouchEnd` needs the latest value, and taking it from state put
   * `pullDistance` in the callback's dependencies — which changes on every
   * touchmove frame, so the effect below tore down all three document listeners
   * and re-attached them dozens of times during a single pull. The ref keeps the
   * value fresh while the callbacks stay stable for the whole gesture.
   */
  const pullDistanceRef = useRef(0);

  // Callbacks change every render; refs keep the listeners stable so the
  // effect below does not re-subscribe mid-gesture.
  const handlersRef = useRef({ onRefresh, onSwipeLeft, onSwipeRight });
  handlersRef.current = { onRefresh, onSwipeLeft, onSwipeRight };

  const isReady = pullDistance >= PULL_THRESHOLD_PX;

  /** Everything back to rest. Shared by a finished pull and a cancelled one. */
  const reset = useCallback(() => {
    pullDistanceRef.current = 0;
    setPullDistance(0);
    setIsPulling(false);
    setIsRefreshing(false);
    isRefreshingRef.current = false;
  }, []);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (isRefreshingRef.current) return;

    const touch = event.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    axisRef.current = null;
    draggingRef.current = false;

    // Dragging across the chart reads its tooltip. Stealing that motion to
    // change the day would make the chart impossible to inspect.
    const target = event.target as Element | null;
    swipeAllowedRef.current = !target?.closest?.('.recharts-wrapper');
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (isRefreshingRef.current || startYRef.current <= 0) return;

    const touch = event.touches[0];
    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    if (axisRef.current === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    if (axisRef.current === 'x') return; // horizontal: let the page be, decide on release

    // Vertical, at the top of the page, pulling down — the refresh gesture.
    if (window.scrollY > 0 || dy <= AXIS_LOCK_PX) return;

    draggingRef.current = true;
    event.preventDefault();
    pullDistanceRef.current = dy;
    setPullDistance(dy);
    setIsPulling(true);
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (isRefreshingRef.current) return;

      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - startXRef.current : 0;
      const dy = touch ? touch.clientY - startYRef.current : 0;

      if (
        axisRef.current === 'x' &&
        swipeAllowedRef.current &&
        Math.abs(dx) >= SWIPE_THRESHOLD_PX &&
        Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO
      ) {
        if (dx < 0) handlersRef.current.onSwipeLeft();
        else handlersRef.current.onSwipeRight();
      }

      if (draggingRef.current) {
        if (pullDistanceRef.current >= PULL_THRESHOLD_PX) {
          isRefreshingRef.current = true;
          setIsRefreshing(true);

          /*
           * A floor on how long the spinner is visible, not a delay after it.
           *
           * This used to wait a flat second AFTER the data had already arrived,
           * so a refresh that took 80 ms still cost the reader 1080. The reason
           * for having anything here at all is real — a spinner that appears and
           * vanishes within a frame reads as a glitch, not as a refresh — but
           * the fix is a minimum total, measured from the start.
           */
          const startedAt = Date.now();
          handlersRef.current.onRefresh().finally(() => {
            const left = Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt));
            setTimeout(reset, left);
          });
        } else {
          reset();
        }
      }

      startXRef.current = 0;
      startYRef.current = 0;
      axisRef.current = null;
      draggingRef.current = false;
    },
    [reset]
  );

  /*
   * The browser can take the gesture away mid-pull, and says so with
   * `touchcancel`: an incoming call, the notification shade, a system sheet.
   * Without this the indicator stayed on screen with no touch left to finish it,
   * and the only way out was to reload.
   */
  const handleTouchCancel = useCallback(() => {
    startXRef.current = 0;
    startYRef.current = 0;
    axisRef.current = null;
    draggingRef.current = false;
    reset();
  }, [reset]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  return { pullDistance, isRefreshing, isPulling, isReady };
}
