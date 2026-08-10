import { describe, it, expect } from 'vitest';
import { decideRun, MAX_STALE_MS } from '../summaryRun';

const KLUCZ = '2026-08-10|R|moderate|-200|18:00|1|2|11|moderate:17:00-20:00#v16';
const TERAZ = new Date('2026-08-10T12:00:00Z');

/** Stored text written `hours` before `TERAZ`. */
const przed = (hours: number) =>
  new Date(TERAZ.getTime() - hours * 60 * 60 * 1000);

describe('decideRun', () => {
  it('skips while the assessment holds and the text is still fresh', () => {
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(1),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.generate).toBe(false);
    expect(d.reason).toContain('bez zmian');
  });

  it('generates once the assessment moves', () => {
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(1),
      key: `${KLUCZ}-inna`,
      now: TERAZ,
    });

    expect(d.generate).toBe(true);
    expect(d.reason).toContain('zmieni');
  });

  it('generates on an unchanged assessment once the text has aged out', () => {
    // The guard against the card vanishing overnight: without it a stable
    // forecast would hold the assessment still until the twelve-hour cutoff hid
    // the summary — and a calm night is when "nothing to worry about" is worth
    // saying most.
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(7),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.generate).toBe(true);
    expect(d.reason).toContain('schowa');
  });

  it('holds the six-hour boundary exactly', () => {
    const tuz = decideRun({
      storedAssessment: KLUCZ,
      storedAt: new Date(TERAZ.getTime() - MAX_STALE_MS + 60_000),
      key: KLUCZ,
      now: TERAZ,
    });
    const dokladnie = decideRun({
      storedAssessment: KLUCZ,
      storedAt: new Date(TERAZ.getTime() - MAX_STALE_MS),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(tuz.generate).toBe(false);
    expect(dokladnie.generate).toBe(true);
  });

  it('generates when there is no summary yet', () => {
    const d = decideRun({
      storedAssessment: null,
      storedAt: null,
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.generate).toBe(true);
    expect(d.reason).toContain('Brak');
  });

  it('generates when the stored time is in the future', () => {
    // A clock disagreement would otherwise read as permanently fresh and freeze
    // the text until it aged back into the past.
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: new Date(TERAZ.getTime() + 60 * 60 * 1000),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.generate).toBe(true);
    expect(d.reason).toContain('przyszlosci');
  });

  it('gives a reason fit to drop straight into the job log', () => {
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(2),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.reason).toMatch(/\d+ godz/);
  });
});
