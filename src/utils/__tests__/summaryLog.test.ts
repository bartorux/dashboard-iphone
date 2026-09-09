import { describe, it, expect } from 'vitest';
import {
  EMPTY_LOG,
  LOG_CAP,
  LOG_FLOOR,
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

  it('drops what has aged out of the window and keeps the rest', () => {
    // Retention counted in TIME rather than in entries. The old rule kept 72
    // entries, which measured on 09.09 covered only 15 hours — a count says
    // nothing about how often the assessment happens to change.
    //
    // Sixty hourly attempts, so the floor (18) is comfortably met and it is
    // the WINDOW that decides: with the incoming attempt at hour 80, hours
    // 0-7 are more than 72 h old and go, hours 8-59 stay.
    let log: ReturnType<typeof appendAttempt> = EMPTY_LOG;
    for (let hour = 0; hour < 60; hour++) {
      log = appendAttempt(log, attempt({
        at: new Date(Date.UTC(2026, 7, 8, hour, 0)).toISOString(),
        prompt: hour,
      }));
    }
    log = appendAttempt(log, attempt({
      at: new Date(Date.UTC(2026, 7, 8, 80, 0)).toISOString(),
      prompt: 999,
    }));

    const prompts = log.attempts.map((entry) => entry.prompt);
    expect(prompts[0]).toBe(8); // hour 7 is 73 h old — gone; hour 8 is 72 h — kept
    expect(prompts).toHaveLength(53); // hours 8-59 plus the new attempt
    expect(prompts[prompts.length - 1]).toBe(999);
  });

  it('keeps a small log whole even past the window — the floor outranks the window below 18 entries', () => {
    // A fresh log with two attempts, one of them 73 h old: the window alone
    // would drop it, the floor keeps it. The floor exists so no single write
    // can leave less than half a day of drafts, and a young log holding a
    // stale attempt for a while is the smaller harm.
    const log = appendAttempt(
      {
        attempts: [
          attempt({ at: '2026-08-08T09:00:00Z', prompt: 1 }),
          attempt({ at: '2026-08-08T11:00:00Z', prompt: 2 }),
        ],
      },
      attempt({ at: '2026-08-11T10:00:00Z', prompt: 3 })
    );

    expect(log.attempts.map((entry) => entry.prompt)).toEqual([1, 2, 3]);
  });

  it('treats the floor as inclusive: exactly LOG_FLOOR survivors need no rescue', () => {
    // Built so the window and the floor disagree with a plain "last N by
    // position" slice, which is the only way to tell `>=` from `>` apart: 17
    // recent attempts, then one stamped a week stale (appended out of time
    // order, so it lands near the END of the array despite being the
    // OLDEST), then a fresh attempt. The window drops exactly the stale one,
    // leaving precisely LOG_FLOOR (18) survivors — the floor must accept
    // that as enough and NOT fall back to slicing the raw array, which would
    // instead drop the oldest-by-POSITION attempt and let the stale one back
    // in.
    let log: ReturnType<typeof appendAttempt> = EMPTY_LOG;
    const base = Date.UTC(2026, 7, 8, 0, 0, 0);
    for (let index = 0; index < 17; index++) {
      log = appendAttempt(log, attempt({
        at: new Date(base + index * 60_000).toISOString(),
        prompt: index,
      }));
    }
    log = appendAttempt(log, attempt({
      at: new Date(base - 7 * 24 * 60 * 60 * 1000).toISOString(),
      prompt: -1,
    }));
    log = appendAttempt(log, attempt({
      at: new Date(base + 17 * 60_000).toISOString(),
      prompt: 100,
    }));

    const prompts = log.attempts.map((entry) => entry.prompt);
    expect(prompts).toHaveLength(LOG_FLOOR);
    expect(prompts).not.toContain(-1);
    expect(prompts[0]).toBe(0);
  });

  it('does not let one stamp from the future erase the history', () => {
    // A broken runner clock. Without the floor: every real attempt lands
    // outside the window and the whole history collapses in one write.
    let log: ReturnType<typeof appendAttempt> = { attempts: [] };
    for (let hour = 0; hour < 30; hour++) {
      log = appendAttempt(log, attempt({
        at: new Date(Date.UTC(2026, 8, 4, hour, 0)).toISOString(),
        prompt: hour,
      }));
    }

    log = appendAttempt(log, attempt({ at: '2027-01-01T00:00:00Z', prompt: 999 }));

    expect(log.attempts.length).toBeGreaterThanOrEqual(LOG_FLOOR);
    expect(LOG_FLOOR).toBe(18);
  });

  it('holds the file under the safety cap', () => {
    // The window is the retention rule; this only bounds what a much faster
    // cadence than measured could do to the file. A minute apart, so the
    // whole run sits well inside the 72 h window and nothing but the cap can
    // trim it.
    let log = EMPTY_LOG;
    const start = Date.UTC(2026, 7, 11, 0, 0, 0);
    for (let index = 0; index < LOG_CAP + 20; index++) {
      log = appendAttempt(log, attempt({
        at: new Date(start + index * 60_000).toISOString(),
        prompt: index,
      }));
    }

    expect(LOG_CAP).toBe(300);
    expect(log.attempts).toHaveLength(LOG_CAP);
    // The twenty oldest went, the newest stayed.
    expect(log.attempts[0].prompt).toBe(20);
    expect(log.attempts[LOG_CAP - 1].prompt).toBe(LOG_CAP + 19);
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
