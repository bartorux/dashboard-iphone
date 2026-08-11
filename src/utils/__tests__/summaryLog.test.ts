import { describe, it, expect } from 'vitest';
import {
  EMPTY_LOG,
  appendAttempt,
  parseLog,
  signalsFor,
  type Attempt,
} from '../summaryLog';

const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  at: '2026-08-11T13:25:00Z',
  prompt: 30,
  accepted: true,
  headline: 'W tych dniach nie ma podstaw do przywołania.',
  body: 'W poniedziałek 17 sierpnia o 20:00 margines jest wąski.',
  outlook: '',
  ...overrides,
});

describe('appendAttempt', () => {
  it('keeps refused answers beside accepted ones', () => {
    // The reason a log exists at all: a refused answer leaves no trace in git,
    // so the one rejection today told us which rule fired and nothing about how
    // close the text had been.
    const log = appendAttempt(EMPTY_LOG, attempt());
    const both = appendAttempt(
      log,
      attempt({ accepted: false, reason: 'tekst zawiera liczbę spoza godzin' })
    );

    expect(both.attempts).toHaveLength(2);
    expect(both.attempts[1].reason).toContain('liczbę');
  });

  it('keeps identical drafts rather than collapsing them', () => {
    // Unlike the forecast log, repetition here IS the finding: the same wording
    // hour after hour is what "the card stopped being read" looks like.
    const log = appendAttempt(EMPTY_LOG, attempt());
    const again = appendAttempt(log, attempt({ at: '2026-08-11T14:25:00Z' }));

    expect(again.attempts).toHaveLength(2);
  });

  it('drops the oldest past the limit', () => {
    let log = EMPTY_LOG;
    for (let index = 0; index < 5; index++) {
      log = appendAttempt(log, attempt({ prompt: index }), 3);
    }

    expect(log.attempts.map((entry) => entry.prompt)).toEqual([2, 3, 4]);
  });

  it('leaves the original untouched', () => {
    const log = appendAttempt(EMPTY_LOG, attempt());
    appendAttempt(log, attempt());

    expect(log.attempts).toHaveLength(1);
  });
});

describe('parseLog', () => {
  it.each([
    ['null', null],
    ['a string', 'nonsense'],
    ['no attempts key', { other: 1 }],
    ['attempts that are not an array', { attempts: 'no' }],
  ])('treats %s as no history', (_label, raw) => {
    expect(parseLog(raw)).toEqual(EMPTY_LOG);
  });

  it('drops entries without a usable timestamp or headline', () => {
    const raw = {
      attempts: [
        { at: 'kiedyś', headline: 'x' },
        { at: '2026-08-11T13:25:00Z' },
        attempt(),
      ],
    };

    expect(parseLog(raw).attempts).toHaveLength(1);
  });
});

describe('signalsFor', () => {
  it('counts how often the verdict is named', () => {
    // Measured across today's twenty published texts: prompts 20-25 said it
    // twice, 26 got it to once, 27 regressed, 28 onwards held. The count alone
    // separated the weak runs from the good ones.
    const dwukrotnie = attempt({
      headline: 'Nie ma podstaw do przywołania.',
      body: '',
      outlook: 'W żadnym z kolejnych dni nie ma podstaw do przywołania.',
    });

    expect(signalsFor(dwukrotnie).przywolania).toBe(2);
    expect(signalsFor(attempt()).przywolania).toBe(1);
  });

  it('finds a clause copied between two lines', () => {
    const powtorka = attempt({
      headline: 'W żadnym dniu nie ma podstaw do przywołania.',
      body: 'Rezerwa pokrywa wymagany poziom.',
      outlook: 'W żadnym dniu nie ma podstaw do przywołania.',
    });

    expect(signalsFor(powtorka).powtorzenie).toContain('nie ma podstaw');
  });

  it('stays quiet when nothing repeats', () => {
    const czyste = attempt({
      headline: 'W tych dniach nie ma podstaw do przywołania.',
      body: 'Najciaśniej wypada poniedziałkowy wieczór, bo brakuje wiatru.',
      outlook: '',
    });

    expect(signalsFor(czyste).powtorzenie).toBe('');
  });

  it('measures length across all three lines', () => {
    const signals = signalsFor(
      attempt({ headline: 'abc', body: 'de', outlook: '' })
    );

    // "abc de" — the empty line contributes nothing, not even its separator.
    expect(signals.dlugosc).toBe(6);
  });
});
