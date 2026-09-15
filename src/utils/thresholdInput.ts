import {
  ORANGE_THRESHOLD_MAX,
  RED_THRESHOLD_MAX,
  RED_THRESHOLD_MIN,
} from './constants';

export type ThresholdField = 'orange' | 'red';

/** The lowest value the Uwaga field takes: one above the lowest Alarm. */
export const ORANGE_THRESHOLD_MIN = RED_THRESHOLD_MIN + 1;

export const THRESHOLD_BOUNDS: Record<ThresholdField, { min: number; max: number }> = {
  orange: { min: ORANGE_THRESHOLD_MIN, max: ORANGE_THRESHOLD_MAX },
  red: { min: RED_THRESHOLD_MIN, max: RED_THRESHOLD_MAX },
};

export type ParsedThreshold = { value: number; error: null } | { value: null; error: string };

/**
 * One field's text as the settings panel sees it.
 *
 * Whole megawatts only, digits and nothing else. The old number input let
 * "1e3", "450.5" and a leading minus through to `Number()`, and the hook then
 * judged only the range — stricter here is deliberate, because this now runs on
 * every keystroke and saves on its own: anything accepted is written without a
 * button anyone has to press.
 *
 * `other` is the saved value of the other field. The relation is checked against
 * it rather than against the other field's draft: a draft that has not been
 * accepted is not a threshold yet, and measuring against it would let one
 * half-typed number make the other field light up red.
 */
export function parseThreshold(
  field: ThresholdField,
  text: string,
  other: number
): ParsedThreshold {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, error: 'Wpisz wartość w MW' };
  if (!/^\d+$/.test(trimmed)) return { value: null, error: 'Wpisz liczbę całkowitą MW' };

  const value = Number(trimmed);
  const { min, max } = THRESHOLD_BOUNDS[field];
  if (value < min || value > max) {
    return { value: null, error: `Wpisz wartość od ${min} do ${max} MW` };
  }

  if (field === 'orange' && value <= other) {
    return { value: null, error: `Musi być wyższy niż próg Alarm (${other} MW)` };
  }
  if (field === 'red' && value >= other) {
    return { value: null, error: `Musi być niższy niż próg Uwaga (${other} MW)` };
  }

  return { value, error: null };
}

/**
 * Where a stepper press lands: the next multiple of `step` in that direction,
 * so 437 goes to 450 rather than 487. The field steps the way people round the
 * figure in their heads, and a value typed off the grid comes back onto it on
 * the first press.
 */
export function stepThreshold(value: number, direction: 1 | -1, step: number): number {
  const snapped = direction === 1
    ? Math.floor(value / step) * step + step
    : Math.ceil(value / step) * step - step;
  return snapped;
}
