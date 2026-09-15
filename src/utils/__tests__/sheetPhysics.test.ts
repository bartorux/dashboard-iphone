import { describe, it, expect } from 'vitest';
import {
  project,
  releaseVelocity,
  rubberband,
  shouldDismiss,
  springAtRest,
  stepSpring,
  SPRING_DISMISS,
  SPRING_RETURN,
} from '../sheetPhysics';

/** Runs a spring until it rests, returning how far past the target it ever got. */
function settle(from: number, to: number, velocity: number, config = SPRING_DISMISS) {
  let state = { position: from, velocity };
  let overshoot = 0;
  for (let frame = 0; frame < 600; frame++) {
    state = stepSpring(state, to, 1 / 60, config);
    overshoot = Math.max(overshoot, (state.position - to) * Math.sign(to - from || 1));
    if (springAtRest(state, to)) return { frames: frame + 1, overshoot };
  }
  return { frames: Infinity, overshoot };
}

describe('sheet springs', () => {
  it('a critically damped spring arrives without passing the target', () => {
    const { frames, overshoot } = settle(700, 0, 0);

    expect(frames).toBeLessThan(60);
    expect(overshoot).toBeLessThan(0.5);
  });

  it('the return spring after a flick swings past a little, as the momentum says it should', () => {
    const { frames, overshoot } = settle(200, 0, -2500, SPRING_RETURN);

    expect(frames).toBeLessThan(90);
    expect(overshoot).toBeGreaterThan(1);
  });

  it('survives a late frame without blowing up', () => {
    const state = stepSpring({ position: 700, velocity: 0 }, 0, 0.5, SPRING_DISMISS);

    expect(Math.abs(state.position)).toBeLessThan(700);
  });
});

describe('momentum and edges', () => {
  it('projects a release the way Apple does', () => {
    // (1000 / 1000) * 0.998 / 0.002
    expect(project(1000)).toBeCloseTo(499, 5);
    expect(project(0)).toBe(0);
  });

  it('resists more the further past the edge', () => {
    const near = rubberband(50, 700);
    const far = rubberband(500, 700);

    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(50);
    expect(far / 500).toBeLessThan(near / 50);
    expect(rubberband(-50, 700)).toBeCloseTo(-near, 5);
  });

  it('dismisses on a quick flick even from near the top', () => {
    expect(shouldDismiss(40, 1500, 700)).toBe(true);
  });

  it('keeps a slow drag that stops short of halfway', () => {
    expect(shouldDismiss(200, 0, 700)).toBe(false);
  });

  it('keeps a long drag that ends pushing back up', () => {
    expect(shouldDismiss(450, -1200, 700)).toBe(false);
  });

  it('measures velocity over the last 100 ms only', () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 500, y: 10 },
      { t: 550, y: 60 },
      { t: 600, y: 110 },
    ];

    expect(releaseVelocity(samples)).toBeCloseTo(1000, 5);
  });
});
