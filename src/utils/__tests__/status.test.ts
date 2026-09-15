import { describe, it, expect } from 'vitest';
import { marginLabel, STATUS_LABEL } from '../status';

/*
 * Etap 2, naprawa B: the word printed BESIDE a signed margin figure must not
 * be the bar-level "ALARM"/"UWAGA" (STATUS_LABEL) — findAlerts' red weight is
 * an early-warning line (difference <= redThreshold), not a deficit test, so
 * a range can be red at a still-positive margin. marginLabel is the one
 * function AlertsPanel and ReserveTooltip both call, so the wording cannot
 * drift between the two call sites.
 */
describe('marginLabel', () => {
  it('words a red status with a positive margin as a threshold breach, not a deficit', () => {
    expect(marginLabel('alarm', 227)).toBe('Poniżej progu');
    expect(marginLabel('alarm', 0)).toBe('Poniżej progu');
  });

  it('words a red status with a negative margin as an actual shortfall', () => {
    expect(marginLabel('alarm', -1)).toBe('Niedobór rezerwy');
    expect(marginLabel('alarm', -400)).toBe('Niedobór rezerwy');
  });

  it('words a warn status as "Blisko progu" regardless of sign', () => {
    expect(marginLabel('warn', 360)).toBe('Blisko progu');
    expect(marginLabel('warn', 0)).toBe('Blisko progu');
  });

  it('falls back to STATUS_LABEL for ok and unknown, which are not misleading beside a number', () => {
    expect(marginLabel('ok', 900)).toBe(STATUS_LABEL.ok);
    expect(marginLabel('unknown', NaN)).toBe(STATUS_LABEL.unknown);
  });
});
