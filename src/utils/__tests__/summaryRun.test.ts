import { describe, it, expect } from 'vitest';
import { askWithRetry, decideRun, MAX_STALE_MS } from '../summaryRun';

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

/**
 * The retry exists because a refusal used to end the run and leave the card
 * standing with the previous text for an hour — seven in a row on the night of
 * 17 August held it for six. Every gate we add makes that more likely, so the
 * loop is what stops a gate from costing the reader anything.
 */
describe('askWithRetry', () => {
  /** A judge that accepts anything but the word "zle". */
  const oceniaj = (tekst: string) =>
    tekst === 'zle'
      ? { ok: false, summary: null, reason: 'odrzucone' }
      : { ok: true, summary: { tekst } };

  /** Records what was asked and what was written down. */
  function stanowisko(odpowiedzi: Array<string | null>) {
    const zapisane: Array<{ ok: boolean; reason?: string }> = [];
    let pytan = 0;
    return {
      zapisane,
      pytan: () => pytan,
      ask: async () => odpowiedzi[pytan++] ?? null,
      record: (proba: { ok: boolean; reason?: string }) =>
        zapisane.push({ ok: proba.ok, reason: proba.reason }),
    };
  }

  it('asks again when the first answer is refused', async () => {
    const s = stanowisko(['zle', 'dobrze']);
    const wynik = await askWithRetry(s.ask, oceniaj, s.record);

    expect(wynik.ok).toBe(true);
    expect(wynik.summary).toEqual({ tekst: 'dobrze' });
    // Both attempts written down, the refused one included: logging only the
    // last would hide how often the first misses, and that rate is the only
    // signal for whether the gates are set right.
    expect(s.zapisane).toEqual([
      { ok: false, reason: 'odrzucone' },
      { ok: true, reason: undefined },
    ]);
  });

  it('asks exactly once when the first answer stands', async () => {
    const s = stanowisko(['dobrze', 'dobrze']);
    const wynik = await askWithRetry(s.ask, oceniaj, s.record);

    expect(wynik.ok).toBe(true);
    // The assertion that catches a loop retrying unconditionally — which would
    // double the bill for nothing and go unnoticed, since the result is right.
    expect(s.pytan()).toBe(1);
    expect(s.zapisane).toHaveLength(1);
  });

  it('gives up after the last attempt, carrying that attempt\'s reason', async () => {
    const s = stanowisko(['zle', 'zle']);
    const wynik = await askWithRetry(s.ask, oceniaj, s.record);

    expect(wynik).toMatchObject({ ok: false, reason: 'odrzucone' });
    expect(s.pytan()).toBe(2);
    expect(s.zapisane).toHaveLength(2);
  });

  it('counts an empty answer as a failed attempt, not a crash', async () => {
    // The model occasionally returns a candidate with no text at all, and that
    // is exactly the case a second ask tends to resolve.
    const s = stanowisko([null, 'dobrze']);
    const wynik = await askWithRetry(s.ask, oceniaj, s.record);

    expect(wynik.ok).toBe(true);
    expect(s.zapisane[0]).toEqual({ ok: false, reason: 'Model nie zwrocil tekstu' });
  });

  it('still asks once when told to make no attempts at all', async () => {
    const s = stanowisko(['dobrze']);
    await askWithRetry(s.ask, oceniaj, s.record, 0);
    expect(s.pytan()).toBe(1);
  });
});
