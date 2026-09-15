/*
 * Motion maths for the settings sheet, kept free of the DOM so it can be tested
 * on its own. Values follow Apple's "Designing Fluid Interfaces" (WWDC 2018):
 * springs described by damping ratio and response rather than mass and
 * stiffness, momentum projected with the same exponential decay scroll views
 * use, and resistance past an edge rather than a hard stop.
 */

export interface SpringConfig {
  /** 1 settles without overshoot; below 1 it swings past the target first. */
  dampingRatio: number;
  /** Roughly how long, in seconds, the value takes to get there. Not a duration. */
  response: number;
}

export interface SpringState {
  position: number;
  /** Units per second. */
  velocity: number;
}

/** Presenting and dismissing on a tap: no bounce, nothing threw it. */
export const SPRING_PRESENT: SpringConfig = { dampingRatio: 1, response: 0.4 };
export const SPRING_DISMISS: SpringConfig = { dampingRatio: 1, response: 0.3 };
/**
 * Back into place after a drag that did not dismiss. A little bounce, and only
 * here: the finger carried momentum into it. The same overshoot on a sheet that
 * merely opened would read as the interface showing off.
 */
export const SPRING_RETURN: SpringConfig = { dampingRatio: 0.8, response: 0.3 };

/** Fixed sub-step, so a dropped frame lengthens the animation rather than blowing it up. */
const STEP_S = 1 / 240;

/**
 * Advances a spring by `dt` seconds towards `target`.
 *
 * Semi-implicit Euler on unit mass: stiffness (2π / response)² and damping
 * 4π·ζ / response are what those two parameters mean. Stepped in small fixed
 * slices because a frame can arrive late, and one 100 ms Euler step on a stiff
 * spring overshoots into nonsense.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  dt: number,
  config: SpringConfig
): SpringState {
  const stiffness = (2 * Math.PI / config.response) ** 2;
  const damping = (4 * Math.PI * config.dampingRatio) / config.response;
  let { position, velocity } = state;
  let remaining = Math.min(dt, 0.1);
  while (remaining > 0) {
    const h = Math.min(STEP_S, remaining);
    const force = -stiffness * (position - target) - damping * velocity;
    velocity += force * h;
    position += velocity * h;
    remaining -= h;
  }
  return { position, velocity };
}

/** Close enough, and slow enough, that the next frame would not show a difference. */
export function springAtRest(state: SpringState, target: number): boolean {
  return Math.abs(state.position - target) < 0.5 && Math.abs(state.velocity) < 10;
}

/**
 * Where a release at `velocity` (px/s) would coast to, in px. Apple's own
 * function; 0.998 is the normal scroll deceleration rate.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * How far an element follows a finger dragged `overshoot` px past its edge. The
 * further past it, the less it follows, so the edge reads as soft rather than
 * frozen.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  const sign = overshoot < 0 ? -1 : 1;
  const distance = Math.abs(overshoot);
  return sign * ((distance * dimension * constant) / (dimension + constant * distance));
}

/**
 * Whether a released drag dismisses the sheet.
 *
 * Decided on where the gesture was GOING, not where it stopped: the projected
 * rest position is compared with the halfway point. A short, quick flick
 * dismisses; a long, slow drag that ends with the finger pushing back up does
 * not.
 */
export function shouldDismiss(offset: number, velocity: number, height: number): boolean {
  if (height <= 0) return offset > 0;
  return offset + project(velocity) > height / 2;
}

/** Release velocity from the last few samples, px/s. Older than 100 ms says nothing about the flick. */
export function releaseVelocity(samples: { t: number; y: number }[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const sample of samples) {
    if (last.t - sample.t <= 100) {
      first = sample;
      break;
    }
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return ((last.y - first.y) / dt) * 1000;
}
