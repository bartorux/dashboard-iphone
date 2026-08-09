import { describe, it, expect } from 'vitest';
import { decideRun, MAX_STALE_MS } from '../summaryRun';

const KLUCZ = '2026-08-10|R|moderate|-200|18:00|1|2|11|moderate:17:00-20:00#v16';
const TERAZ = new Date('2026-08-10T12:00:00Z');

/** Stored text written `hours` before `TERAZ`. */
const przed = (hours: number) =>
  new Date(TERAZ.getTime() - hours * 60 * 60 * 1000);

describe('decideRun', () => {
  it('pomija, gdy ocena bez zmian i tekst swiezy', () => {
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(1),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.generate).toBe(false);
    expect(d.reason).toContain('bez zmian');
  });

  it('generuje, gdy ocena sie zmienila', () => {
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(1),
      key: `${KLUCZ}-inna`,
      now: TERAZ,
    });

    expect(d.generate).toBe(true);
    expect(d.reason).toContain('zmieni');
  });

  it('generuje mimo niezmienionej oceny, gdy tekst sie zestarzal', () => {
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

  it('trzyma granice szesciu godzin dokladnie', () => {
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

  it('generuje, gdy nie ma jeszcze zadnego podsumowania', () => {
    const d = decideRun({
      storedAssessment: null,
      storedAt: null,
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.generate).toBe(true);
    expect(d.reason).toContain('Brak');
  });

  it('generuje, gdy zapisany czas jest z przyszlosci', () => {
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

  it('podaje powod nadajacy sie prosto do logu zadania', () => {
    const d = decideRun({
      storedAssessment: KLUCZ,
      storedAt: przed(2),
      key: KLUCZ,
      now: TERAZ,
    });

    expect(d.reason).toMatch(/\d+ godz/);
  });
});
