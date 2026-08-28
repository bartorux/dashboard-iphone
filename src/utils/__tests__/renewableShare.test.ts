import { describe, it, expect } from 'vitest';
import { renewableMixShare } from '../renewableShare';

describe('renewableMixShare', () => {
  it('pins 67% on the canonical fixture (28.08.2026 noon)', () => {
    // pv 11 619 + wind 4 931 over (kseDemand 19 950 − exchange −4 640) = 24 590.
    // Divided by kseDemand alone (the frame this replaced) it would read 83% —
    // the mutation that drops the exchange term must move this number.
    expect(renewableMixShare(11619, 4931, 19950, -4640)).toBe(67);
  });

  it('is null when pv is missing', () => {
    expect(renewableMixShare(null, 4931, 19950, -4640)).toBeNull();
  });

  it('is null when wind is missing', () => {
    expect(renewableMixShare(11619, null, 19950, -4640)).toBeNull();
  });

  it('is null when kseDemand is unpublished', () => {
    expect(renewableMixShare(11619, 4931, null, -4640)).toBeNull();
  });

  it('is null when exchange is unpublished', () => {
    // kseDemand alone is not enough: a silent fallback to exchange ?? 0 would
    // print a line built on a made-up number instead of just not showing one.
    expect(renewableMixShare(11619, 4931, 19950, null)).toBeNull();
  });

  it('is null when the denominator is zero or negative', () => {
    // kseDemand fully cancelled or overtaken by exchange — no honest share to report.
    expect(renewableMixShare(1000, 500, 5000, 5000)).toBeNull();
    expect(renewableMixShare(1000, 500, 5000, 6000)).toBeNull();
  });

  it('adding exchange instead of subtracting it moves the canonical figure', () => {
    // The mutation the task calls out: kseDemand + exchange instead of
    // kseDemand − exchange. Documented here as the arithmetic this guards,
    // not as a live toggle — the function itself only ever subtracts.
    const wrongDenominator = 19950 + -4640; // 15310
    const wrongShare = Math.round(((11619 + 4931) / wrongDenominator) * 100);
    expect(wrongShare).not.toBe(67);
    expect(renewableMixShare(11619, 4931, 19950, -4640)).toBe(67);
  });
});
