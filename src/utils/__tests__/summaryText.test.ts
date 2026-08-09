import { describe, it, expect } from 'vitest';
import { parseSummary, validateSummary } from '../summaryText';
import { assessmentKey, buildFacts } from '../summaryFacts';
import { makePoint } from '../../test/factories';

const pad = (value: number) => String(value).padStart(2, '0');

function hourOn(
  businessDate: string,
  startHour: number,
  overrides: Partial<Parameters<typeof makePoint>[0]> = {}
) {
  return makePoint({
    businessDate,
    hourLabel: `${pad(startHour)}:00`,
    endLabel: `${pad((startHour + 1) % 24)}:00`,
    time: new Date(`${businessDate}T${pad((startHour + 1) % 24)}:00:00Z`),
    ...overrides,
  });
}

const HOURS = new Set(['19:00', '20:00']);

const good = {
  headline: 'Nie ma podstaw do ogłoszenia okresu przywołania.',
  body: 'Rezerwa pokrywa wymaganą wartość. Najciaśniej będzie o 20:00.',
  outlook: 'W kolejnych dniach margines pozostaje bezpieczny.',
};

describe('parseSummary', () => {
  it('reads the three labelled lines', () => {
    const parsed = parseSummary(
      'NAGŁÓWEK: Pierwsze zdanie.\nTREŚĆ: Drugie zdanie.\nDALEJ: Trzecie zdanie.'
    );
    expect(parsed).toEqual({
      headline: 'Pierwsze zdanie.',
      body: 'Drugie zdanie.',
      outlook: 'Trzecie zdanie.',
    });
  });

  it('refuses a reply missing a field rather than half-filling one', () => {
    expect(parseSummary('NAGŁÓWEK: Samotne zdanie.')).toBeNull();
    expect(parseSummary('zupelnie co innego')).toBeNull();
  });
});

describe('validateSummary', () => {
  it('accepts prose whose only digits are hours we computed', () => {
    expect(validateSummary(good, HOURS)).toEqual({ ok: true });
  });

  it('lets the 1100 MW threshold through, since the facts hand it over', () => {
    // Banning it deadlocked the generator: the facts and the instruction both
    // put "próg 1100 MW" in front of the model, then every answer quoting it was
    // refused. It is a fixed figure from the regulation, not a reading of the
    // hour, so it cannot be wrong about the situation.
    const withThreshold = {
      ...good,
      body: 'Nadwyżka wciąż przekracza próg 1100 MW, więc operator ma prawo nie ogłaszać przywołania.',
    };

    expect(validateSummary(withThreshold, HOURS)).toEqual({ ok: true });
  });

  it('still refuses any other figure, even beside the permitted one', () => {
    const mixed = {
      ...good,
      body: 'Nadwyżka przekracza próg 1100 MW, a margines wynosi 250 MW.',
    };

    expect(validateSummary(mixed, HOURS).ok).toBe(false);
  });

  it('rejects a power figure, however it is written', () => {
    expect(
      validateSummary({ ...good, body: 'Margines spada do 177 MW.' }, HOURS).ok
    ).toBe(false);
    // Told not to use digits, one run simply spelled the figure out instead.
    expect(
      validateSummary(
        { ...good, body: 'Margines spada poniżej trzystu megawatów.' },
        HOURS
      ).ok
    ).toBe(false);
  });

  it('rejects a sentence that contradicts itself about coverage', () => {
    // Published once: the reserve "covers the required value, although the
    // margin is negative" — two descriptions of one fact set against each
    // other. There is no state in which both halves hold.
    const inverted = {
      ...good,
      body:
        'W poniedziałek rezerwa pokrywa wymaganą wartość, choć margines jest ujemny.',
    };

    const verdict = validateSummary(inverted, HOURS);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('przeczy') });
  });

  it('allows the correct pairing, which the instruction actually demands', () => {
    // Checking for the two words alone rejected this — and the instruction asks
    // for exactly this sentence — so every run was refused and the published
    // text sat frozen while each rerun looked like "no change".
    const correct = {
      ...good,
      body: 'O 20:00 margines jest ujemny, więc rezerwa nie pokrywa wymaganego poziomu.',
    };

    expect(validateSummary(correct, HOURS)).toEqual({ ok: true });
  });

  it('still allows the two words in separate sentences, where both can be true', () => {
    const fine = {
      ...good,
      body:
        'W niedzielę rezerwa pokrywa wymaganą wartość. W poniedziałek margines jest ujemny.',
    };

    expect(validateSummary(fine, HOURS).ok).toBe(true);
  });

  it('rejects the window metaphor, which reached a published summary', () => {
    // "The window stays open" — from my own wording of the facts, shortened by
    // the model until nothing was left to say what the window was.
    const metaphor = {
      ...good,
      body: 'Operator może nie ogłaszać przywołania, a okno pozostaje otwarte.',
    };

    expect(validateSummary(metaphor, HOURS).ok).toBe(false);
  });

  it('accepts the same fact said plainly', () => {
    const plain = {
      ...good,
      body: 'Operator może nie ogłaszać przywołania. Ogłoszenie może jeszcze nadejść.',
    };

    expect(validateSummary(plain, HOURS).ok).toBe(true);
  });

  it('rejects Polish written without its diacritics', () => {
    // The failure mode seen twice at looser settings, once producing a Hungarian
    // ű in place of ż. Raising the temperature for variety makes it likelier,
    // so it is refused outright rather than published.
    const stripped = {
      headline: 'Nie ma podstaw do ogloszenia okresu przywolania.',
      body: 'Rezerwa pokrywa wymagana wartosc przez caly czas.',
      outlook: 'W kolejnych dniach margines pozostaje bezpieczny.',
    };

    expect(validateSummary(stripped, HOURS).ok).toBe(false);
  });

  it('rejects an hour that is not among the facts', () => {
    const verdict = validateSummary(
      { ...good, body: 'Najciaśniej będzie o 03:00.' },
      HOURS
    );
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('03:00') });
  });

  it('rejects any other number', () => {
    expect(
      validateSummary({ ...good, outlook: 'Dotyczy 3 kolejnych dni.' }, HOURS).ok
    ).toBe(false);
  });

  it('rejects an empty or runaway field', () => {
    expect(validateSummary({ ...good, headline: '  ' }, HOURS).ok).toBe(false);
    expect(
      validateSummary({ ...good, body: 'Zdanie. '.repeat(200) }, HOURS).ok
    ).toBe(false);
  });
});

describe('assessmentKey', () => {
  const day = (reserve: number) =>
    [19, 20].map((hour) => hourOn('2026-08-10', hour, { reserve, required: 2000 }));

  // A day whose hardest hour is plainly 20:00, so nothing is decided by a tie.
  const dayWithWorstAt20 = [
    hourOn('2026-08-10', 12, { reserve: 6000, required: 2000 }),
    hourOn('2026-08-10', 13, { reserve: 5800, required: 2000 }),
    hourOn('2026-08-10', 19, { reserve: 5000, required: 2000 }),
    hourOn('2026-08-10', 20, { reserve: 4000, required: 2000 }),
  ];

  it('ignores the hours ticking away, which is the whole point', () => {
    // Keyed on anything that moves each hour, the assessment would never look
    // unchanged and the model would run every hour regardless — exactly the
    // waste the check exists to prevent.
    const early = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T00:00:00Z'))
    );
    const later = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T14:00:00Z'))
    );

    expect(early).toBe(later);
  });

  it('does change once the hardest hour is behind us', () => {
    // Not an oversight: the summary named that hour, so it has to be rewritten.
    const before = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T14:00:00Z'))
    );
    const after = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T21:00:00Z'))
    );

    expect(before).not.toBe(after);
  });

  it('ignores a forecast nudged by a few megawatts', () => {
    const before = assessmentKey(buildFacts(day(5000), [], new Date('2026-08-09T00:00:00Z')));
    const after = assessmentKey(buildFacts(day(5010), [], new Date('2026-08-09T00:00:00Z')));

    expect(before).toBe(after);
  });

  it('changes when the verdict does', () => {
    const calm = assessmentKey(buildFacts(day(5000), [], new Date('2026-08-09T00:00:00Z')));
    const short = assessmentKey(buildFacts(day(800), [], new Date('2026-08-09T00:00:00Z')));

    expect(calm).not.toBe(short);
  });

  it('changes when a materially different margin arrives', () => {
    const before = assessmentKey(buildFacts(day(5000), [], new Date('2026-08-09T00:00:00Z')));
    const after = assessmentKey(buildFacts(day(3000), [], new Date('2026-08-09T00:00:00Z')));

    expect(before).not.toBe(after);
  });
});
