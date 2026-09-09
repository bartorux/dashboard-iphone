import { useState } from 'react';

/**
 * Whether the page needs its own "Odśwież" button.
 *
 * The data refreshes itself every fifteen minutes, so the button is never
 * about freshness — it is the one visible, keyboard-reachable way to ask for
 * a refresh where the browser offers none: an installed app has no reload
 * control, and a touch screen's pull-to-refresh only works from the top of
 * the page and not at all for a screen reader. In a plain desktop browser the
 * same request is F5, and the owner's verdict on the button there was "na
 * Windows mnie drażni" (09.09.2026) — so there it goes.
 *
 * Decided from media, not from the user agent: `display-mode: standalone`
 * (plus Safari's `navigator.standalone`) for the installed case, `pointer:
 * coarse` or touch points for a finger. Decided ONCE, at mount, and never
 * subscribed: a first version listened for media changes and the button
 * flickered out of existence in the visual guard's full-page captures —
 * Chromium re-evaluates device metrics for those, the coarse-pointer query
 * flipped for a frame, and the listener hid the button right before the
 * capture. A real page can see the same on a viewport change, and a control
 * that pops in and out is worse than one that is occasionally redundant.
 * Installing the app opens a new window, so mount time is the right time.
 * With no `matchMedia` at all the answer is "show it" — the button is the
 * safe default, its absence is the optimisation.
 */
const STANDALONE = '(display-mode: standalone)';
const COARSE = '(pointer: coarse)';

function wanted(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  // maxTouchPoints alongside the media query: a real phone reports both, but
  // the visual guard's phone profile (Playwright's iPhone emulation) reports
  // only the touch points — and a guard that cannot see the button on a phone
  // cannot guard it. Either signal means a finger, and a finger means the
  // pull gesture is the alternative, not F5.
  const touch = window.matchMedia(COARSE).matches || (navigator.maxTouchPoints ?? 0) > 0;
  return iosStandalone || window.matchMedia(STANDALONE).matches || touch;
}

export function useRefreshButton(): boolean {
  const [show] = useState<boolean>(wanted);
  return show;
}
