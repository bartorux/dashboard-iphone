import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTouchGestures } from '../useTouchGestures';

/**
 * jsdom has no Touch constructor, so events are assembled by hand. Only the
 * fields the hook reads are populated.
 */
function fireTouch(
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
  target: Element = document.body
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touch = { clientX: x, clientY: y };
  Object.assign(event, { touches: [touch], changedTouches: [touch] });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function setup() {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const onSwipeLeft = vi.fn();
  const onSwipeRight = vi.fn();
  const view = renderHook(() =>
    useTouchGestures({ onRefresh, onSwipeLeft, onSwipeRight })
  );
  return { ...view, onRefresh, onSwipeLeft, onSwipeRight };
}

describe('useTouchGestures', () => {
  beforeEach(() => {
    window.scrollY = 0;
    document.body.innerHTML = '';
  });

  afterEach(() => vi.restoreAllMocks());

  it('moves forward in time on a swipe left', () => {
    const { onSwipeLeft, onSwipeRight } = setup();

    fireTouch('touchstart', 300, 400);
    fireTouch('touchmove', 220, 402);
    fireTouch('touchend', 200, 405);

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('moves back on a swipe right', () => {
    const { onSwipeRight } = setup();

    fireTouch('touchstart', 100, 400);
    fireTouch('touchmove', 180, 398);
    fireTouch('touchend', 200, 400);

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('ignores a sideways nudge that never commits', () => {
    const { onSwipeLeft, onSwipeRight } = setup();

    fireTouch('touchstart', 300, 400);
    fireTouch('touchmove', 270, 400);
    fireTouch('touchend', 265, 400);

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not change the day while the chart is being scrubbed', () => {
    // Dragging across the chart reads its tooltip — that motion must stay there
    const chart = document.createElement('div');
    chart.className = 'recharts-wrapper';
    document.body.appendChild(chart);
    const { onSwipeLeft } = setup();

    fireTouch('touchstart', 300, 400, chart);
    fireTouch('touchmove', 200, 402, chart);
    fireTouch('touchend', 180, 405, chart);

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('treats a downward drag at the top of the page as a refresh, not a swipe', () => {
    const { result, onSwipeLeft, onSwipeRight } = setup();

    fireTouch('touchstart', 200, 100);
    fireTouch('touchmove', 205, 200);

    expect(result.current.isPulling).toBe(true);
    expect(result.current.pullDistance).toBe(100);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('refreshes only once the pull passes the threshold', async () => {
    const { onRefresh } = setup();

    fireTouch('touchstart', 200, 100);
    fireTouch('touchmove', 200, 140);
    fireTouch('touchend', 200, 140);

    expect(onRefresh).not.toHaveBeenCalled();

    fireTouch('touchstart', 200, 100);
    fireTouch('touchmove', 200, 200);
    fireTouch('touchend', 200, 200);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('leaves scrolling alone once the gesture locks horizontally', () => {
    setup();

    fireTouch('touchstart', 300, 400);
    const move = fireTouch('touchmove', 220, 405);

    // preventDefault here would fight the browser for a gesture we are not using
    expect(move.defaultPrevented).toBe(false);
  });

  it('does not pull once the page is scrolled away from the top', () => {
    const { result } = setup();
    window.scrollY = 250;

    fireTouch('touchstart', 200, 100);
    fireTouch('touchmove', 200, 220);

    expect(result.current.isPulling).toBe(false);
  });

  it('keeps a diagonal drag on one axis only', () => {
    const { result, onSwipeLeft } = setup();

    // Mostly vertical with sideways drift: the pull wins, the swipe stays quiet
    fireTouch('touchstart', 300, 100);
    fireTouch('touchmove', 280, 200);
    fireTouch('touchend', 260, 210);

    expect(result.current.pullDistance).toBeGreaterThan(0);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
