import { describe, it, expect } from 'vitest';
import fixtureText from '../__fixtures__/pk5l-archiwum-wycinek.jsonl?raw';
import { ALARM_FROM, DWELL_FLOOR_MW, buildBadanie, parseArchiveRows, studyDays } from '../badanie';
import type { ArchiveRow } from '../pk5lArchive';
import type { CallEvent, CompassVersionRow } from '../badanieTypes';

/** One synthetic archive line, in `ArchiveRow`'s committed field order. */
function row(
  businessDate: string,
  hour: number,
  surplus: number,
  required: number,
  readAt: string,
  publicationTsUtc = ''
): ArchiveRow {
  return [businessDate, hour, surplus, required, publicationTsUtc, readAt];
}

// ---------------------------------------------------------------------------
// Real archive slice: data/pk5l-archiwum/{2026-08,2026-09}.jsonl, businessDate
// 2026-09-01 / -02 / -03 only (see the fixture file for how it was cut).
//
// The pinned figures below come from an independent, one-off script (node,
// not committed — see the task report) that re-implements this module's
// definitions directly against the same two source files, so the numbers are
// measured from data, not read off `badanie.ts` itself. `now` is fixed well
// after all three days, so every window here is closed.
// ---------------------------------------------------------------------------

const REAL_NOW = new Date('2026-09-06T00:00:00Z');

const REAL_EVENT: CallEvent = {
  date: '2026-09-02',
  hour: 20,
  kind: 'test',
  scope: 'unit',
  note: 'Testowy okres przywołania.',
};

function realRows(): ArchiveRow[] {
  return parseArchiveRows(fixtureText);
}

describe('studyDays — real archive slice (2026-09-01..03)', () => {
  it('parses the fixture into the three business dates it was cut for', () => {
    const rows = realRows();
    const dates = new Set(rows.map((r) => r[0]));
    expect(dates).toEqual(new Set(['2026-09-01', '2026-09-02', '2026-09-03']));
    // Sanity on the cut itself: both source months contributed rows, because
    // 2026-09-02's own readings start the evening before under `businessDate`.
    expect(rows.length).toBe(7135);
  });

  it('picks the worst hour by the latest known reading, then measures its OWN decision window', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    // 2026-09-02 carries a CallEvent for hour 20 — which, measured
    // independently below, is also what plain auto-selection would have
    // picked on this particular day (hour 20's own latest reading, 857 MW,
    // is the lowest of the day). The event-forcing mechanism itself, where
    // forcing actually changes the outcome, is checked in its own test below
    // with a hand-built event on a different hour.
    expect(byDate.get('2026-09-02')?.worstHour).toBe(20);

    // 2026-09-01 and 2026-09-03 have no event: auto-selected from each
    // candidate hour's own latest archived reading.
    expect(byDate.get('2026-09-01')?.worstHour).toBe(20);
    expect(byDate.get('2026-09-03')?.worstHour).toBe(19);
  });

  it('pins the window (readAt, surplus, required, margin) for all three days', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    const d0901 = byDate.get('2026-09-01')!;
    expect(d0901.window.open).toBe(false);
    expect(d0901.window.readAt).toBe('2026-09-01T09:07:28.853Z');
    expect(d0901.surplus).toBe(1712);
    expect(d0901.required).toBe(2041);
    expect(d0901.margin).toBe(-329);

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.window.open).toBe(false);
    expect(d0902.window.readAt).toBe('2026-09-02T09:07:24.343Z');
    expect(d0902.surplus).toBe(1142);
    expect(d0902.required).toBe(1995);
    expect(d0902.margin).toBe(-853);

    const d0903 = byDate.get('2026-09-03')!;
    expect(d0903.window.open).toBe(false);
    expect(d0903.window.readAt).toBe('2026-09-03T08:07:31.068Z');
    expect(d0903.surplus).toBe(1952);
    expect(d0903.required).toBe(2098);
    expect(d0903.margin).toBe(-146);
  });

  it('pins headroom, dwell and eveMargin raw values', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    const d0901 = byDate.get('2026-09-01')!;
    expect(d0901.headroom.value).toBe(612); // 1712 - 1100
    expect(d0901.dwell.value).toBe(0);
    expect(d0901.eveMargin.value).toBe(556); // last 2026-08-31 reading: 2597 - 2041

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.headroom.value).toBe(42); // 1142 - 1100
    expect(d0902.dwell.value).toBe(21);
    expect(d0902.eveMargin.value).toBe(-939); // last 2026-09-01 reading: 1056 - 1995

    const d0903 = byDate.get('2026-09-03')!;
    expect(d0903.headroom.value).toBe(852); // 1952 - 1100
    expect(d0903.dwell.value).toBe(0);
    expect(d0903.eveMargin.value).toBe(170); // last 2026-09-02 reading: 2268 - 2098
  });

  it('ranks headroom 1.0 for the worst day, 0.0 for the best, across the 3-day population', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    // headroom: 09-02 = 42 (worst), 09-01 = 612 (middle), 09-03 = 852 (best).
    expect(byDate.get('2026-09-02')?.headroom.percentile).toBe(1);
    expect(byDate.get('2026-09-01')?.headroom.percentile).toBe(0.5);
    expect(byDate.get('2026-09-03')?.headroom.percentile).toBe(0);

    expect(byDate.get('2026-09-02')?.headroom.extreme).toBe(true);
    expect(byDate.get('2026-09-01')?.headroom.extreme).toBe(false);
    expect(byDate.get('2026-09-03')?.headroom.extreme).toBe(false);
  });

  it('ranks dwell and eveMargin the same way, each worst on 2026-09-02', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    // dwell: 21 vs 0 vs 0 — 09-02 strictly worse than both others.
    expect(byDate.get('2026-09-02')?.dwell.percentile).toBe(1);
    expect(byDate.get('2026-09-02')?.dwell.extreme).toBe(true);
    expect(byDate.get('2026-09-01')?.dwell.percentile).toBe(0);
    expect(byDate.get('2026-09-03')?.dwell.percentile).toBe(0);

    // eveMargin: -939 (09-02, worst) vs +556 (09-01, best) vs +170 (09-03, middle).
    expect(byDate.get('2026-09-02')?.eveMargin.percentile).toBe(1);
    expect(byDate.get('2026-09-02')?.eveMargin.extreme).toBe(true);
    expect(byDate.get('2026-09-01')?.eveMargin.percentile).toBe(0);
    expect(byDate.get('2026-09-03')?.eveMargin.percentile).toBe(0.5);
  });

  it('calls 2026-09-02 a hit (trafienie): 3 of 4 features extreme AND the test call period is on record', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.extremeCount).toBe(3); // compass is [] here, so it never contributes
    expect(d0902.event).toEqual(REAL_EVENT);
    expect(d0902.verdict).toBe('trafienie');

    // The two quiet days: nothing extreme, nothing declared.
    expect(byDate.get('2026-09-01')?.verdict).toBe('cisza');
    expect(byDate.get('2026-09-03')?.verdict).toBe('cisza');
  });

  it('carries every archived reading of the target hour, oldest first, matching the pinned counts', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    const d0901 = byDate.get('2026-09-01')!;
    expect(d0901.readings.length).toBe(80);
    expect(d0901.readings[0][0]).toBe('2026-08-28T18:59:47.185Z');
    expect(d0901.readings[d0901.readings.length - 1][0]).toBe('2026-09-01T20:07:28.659Z');

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.readings.length).toBe(107);

    const d0903 = byDate.get('2026-09-03')!;
    expect(d0903.readings.length).toBe(133);

    // Strictly ascending readAt — the whole study depends on this order.
    for (const day of [d0901, d0902, d0903]) {
      for (let i = 1; i < day.readings.length; i++) {
        expect(Date.parse(day.readings[i][0])).toBeGreaterThanOrEqual(Date.parse(day.readings[i - 1][0]));
      }
    }
  });

  it('event forces the target hour, overriding auto-selection even when the two disagree', () => {
    // On the real data, 2026-09-03 auto-selects hour 19 (measured independently:
    // hour 19's own latest reading, 1437 MW, is the day's lowest — see the
    // "picks the worst hour" test above and the task report). A hand-built
    // event for a deliberately different hour (12, one of the day's calmest)
    // isolates the forcing rule itself from what auto-selection would have
    // chosen anyway.
    const rows = realRows();
    const forcedEvent: CallEvent = { date: '2026-09-03', hour: 12, kind: 'real', scope: 'market' };

    const withoutEvent = studyDays(rows, [], [], REAL_NOW);
    const withEvent = studyDays(rows, [], [forcedEvent], REAL_NOW);

    const auto = withoutEvent.find((d) => d.date === '2026-09-03')!;
    const forced = withEvent.find((d) => d.date === '2026-09-03')!;

    expect(auto.worstHour).toBe(19);
    expect(auto.event).toBeNull();
    expect(forced.worstHour).toBe(12);
    expect(forced.event).toEqual(forcedEvent);
  });

  it('buildBadanie carries the constants and events through unchanged', () => {
    const file = buildBadanie(realRows(), [], [REAL_EVENT], REAL_NOW);
    expect(file.generatedAt).toBe(REAL_NOW.toISOString());
    expect(file.noticeHours).toBe(8);
    expect(file.exemptionMw).toBe(1100);
    expect(file.dwellFloorMw).toBe(DWELL_FLOOR_MW);
    expect(file.alarmFrom).toBe(ALARM_FROM);
    expect(file.events).toEqual([REAL_EVENT]);
    expect(file.days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
});

// ---------------------------------------------------------------------------
// parseArchiveRows
// ---------------------------------------------------------------------------

describe('parseArchiveRows', () => {
  it('parses well-formed lines and skips a broken one without throwing', () => {
    const text = [
      '["2026-06-01",10,2000,1000,"2026-06-01 08:00:00","2026-06-01T08:00:05.000Z"]',
      'not json at all',
      '["2026-06-01",11,1900,1050,"","2026-06-01T09:00:05.000Z"]',
      '["2026-06-01","not-a-number",1900,1050,"","2026-06-01T09:00:05.000Z"]', // bad hour type
      '["06-01",10,1900,1050,"","2026-06-01T09:00:05.000Z"]', // bad date shape
      '[]',
      '',
      '   ',
    ].join('\n');

    const rows = parseArchiveRows(text);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['2026-06-01', 10, 2000, 1000, '2026-06-01 08:00:00', '2026-06-01T08:00:05.000Z']);
    expect(rows[1]).toEqual(['2026-06-01', 11, 1900, 1050, '', '2026-06-01T09:00:05.000Z']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseArchiveRows('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Synthetic unit tests — small, hand-built fixtures isolating one rule each.
//
// All target hours below are 15:00 in June/July (Europe/Warsaw, CEST, UTC+2),
// well clear of the DST transition — so "hour 15 local" is always UTC 13:00,
// and its deadline (NOTICE_HOURS=8 earlier) is always UTC 05:00 the same day.
// ---------------------------------------------------------------------------

describe('window selection: the deadline boundary', () => {
  it('picks the last reading AT OR BEFORE the deadline, inclusive, and ignores later ones', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-05', 15, 1000, 1000, '2026-07-05T04:00:00Z'), // before deadline
      row('2026-07-05', 15, 2000, 1000, '2026-07-05T05:00:00Z'), // == deadline: must count
      row('2026-07-05', 15, 3000, 1000, '2026-07-05T06:00:00Z'), // after deadline: must not
    ];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.window.open).toBe(false);
    expect(day.window.deadline).toBe('2026-07-05T05:00:00.000Z');
    expect(day.window.readAt).toBe('2026-07-05T05:00:00Z');
    expect(day.surplus).toBe(2000);
  });

  it('when no reading exists before the deadline and the window is closed, every measured field is null', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-05', 15, 3000, 1000, '2026-07-05T06:00:00Z'), // only after deadline
    ];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.window.open).toBe(false);
    expect(day.window.readAt).toBeNull();
    expect(day.surplus).toBeNull();
    expect(day.margin).toBeNull();
    expect(day.headroom.value).toBeNull();
    expect(day.dwell.value).toBeNull();
    expect(day.eveMargin.value).toBeNull();
    expect(day.compass.level).toBeNull();
  });
});

describe('auto target hour: tie-break', () => {
  it('picks the EARLIER hour when two candidate hours tie on their latest surplus', () => {
    const now = new Date('2026-07-20T00:00:00Z');
    const rows: ArchiveRow[] = [
      // Hour 14 and hour 16 both settle on the same latest surplus (900) —
      // the day's actual minimum. Hour 14 comes first, so it must win.
      row('2026-07-15', 14, 900, 1000, '2026-07-15T05:00:00Z'),
      row('2026-07-15', 16, 900, 1000, '2026-07-15T05:00:00Z'),
      // A clearly higher, non-competing hour, so the tie above is really
      // between 14 and 16 and not an accident of there being only one hour.
      row('2026-07-15', 18, 2000, 1000, '2026-07-15T05:00:00Z'),
    ];

    const [day] = studyDays(rows, [], [], now);

    expect(day.worstHour).toBe(14);
  });
});

describe('open day', () => {
  it('is open while now is before the deadline, uses the latest reading KNOWN SO FAR, and gets verdict "otwarte"', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-01', 15, 1800, 1000, '2026-07-01T01:00:00Z'),
      // Timestamped after `now` — must not be visible yet, even though it is
      // still well before the (still-distant) deadline.
      row('2026-07-01', 15, 500, 1000, '2026-07-01T03:00:00Z'),
    ];
    const now = new Date('2026-07-01T02:00:00Z'); // deadline is 05:00Z: still open

    const [day] = studyDays(rows, [], [], now);

    expect(day.window.open).toBe(true);
    expect(day.window.readAt).toBe('2026-07-01T01:00:00Z');
    expect(day.surplus).toBe(1800);
    expect(day.verdict).toBe('otwarte');
  });
});

describe('dwell', () => {
  it('counts consecutive readings below the floor walking back from the window reading, and a reading at/above the floor breaks the count', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-08', 15, 2000, 1000, '2026-07-08T00:00:00Z'), // >= floor, before the break — must not be reached
      row('2026-07-08', 15, 1600, 1000, '2026-07-08T01:00:00Z'), // >= floor: the break
      row('2026-07-08', 15, 1200, 1000, '2026-07-08T02:00:00Z'), // < floor
      row('2026-07-08', 15, 900, 1000, '2026-07-08T03:00:00Z'), // < floor
      row('2026-07-08', 15, 800, 1000, '2026-07-08T04:00:00Z'), // < floor — the window reading
    ];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.window.readAt).toBe('2026-07-08T04:00:00Z');
    expect(day.dwell.value).toBe(3); // 800, 900, 1200 — stops at the 1600 reading
  });
});

describe('eveMargin', () => {
  it('takes the LAST reading stamped on D-1, not the first', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-09', 15, 1800, 1000, '2026-07-09T04:00:00Z'), // the window reading itself
      row('2026-07-09', 15, 500, 1000, '2026-07-08T06:00:00Z'), // D-1, early: margin -500
      row('2026-07-09', 15, 3000, 1000, '2026-07-08T20:00:00Z'), // D-1, late: margin +2000 — this one must win
    ];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.eveMargin.value).toBe(2000);
  });

  it('is null when no reading was stamped on D-1', () => {
    const rows: ArchiveRow[] = [row('2026-07-09', 15, 1800, 1000, '2026-07-09T04:00:00Z')];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.eveMargin.value).toBeNull();
  });
});

describe('compass', () => {
  it('picks the version with the latest publishedAt AT OR BEFORE the window, never one published after it', () => {
    const rows: ArchiveRow[] = [row('2026-07-11', 15, 1800, 1000, '2026-07-11T04:00:00Z')];
    const compass: CompassVersionRow[] = [
      { businessDate: '2026-07-11', hour: 15, level: 1, publishedAt: '2026-07-10T00:00:00Z' },
      { businessDate: '2026-07-11', hour: 15, level: 3, publishedAt: '2026-07-11T03:00:00Z' }, // latest <= window
      // Published AFTER the window (04:00Z) — must stay invisible. Given a
      // level that would flip `extreme` if it leaked through, so a mistake
      // here fails loudly rather than by coincidence.
      { businessDate: '2026-07-11', hour: 15, level: 0, publishedAt: '2026-07-11T10:00:00Z' },
    ];
    const now = new Date('2026-07-15T00:00:00Z');

    const [day] = studyDays(rows, compass, [], now);

    expect(day.compass.level).toBe(3);
    expect(day.compass.extreme).toBe(true);
  });

  it('is null when no compass version qualifies', () => {
    const rows: ArchiveRow[] = [row('2026-07-11', 15, 1800, 1000, '2026-07-11T04:00:00Z')];
    const now = new Date('2026-07-15T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.compass.level).toBeNull();
    expect(day.compass.extreme).toBe(false);
  });
});

describe('percentile: single-day population', () => {
  it('is null when there is only one day, since it has no OTHER day to rank against', () => {
    const rows: ArchiveRow[] = [row('2026-08-01', 15, 1800, 1000, '2026-08-01T04:00:00Z')];
    const now = new Date('2026-08-05T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.headroom.value).toBe(700); // 1800 - 1100: the value itself is known
    expect(day.headroom.percentile).toBeNull();
    expect(day.headroom.extreme).toBe(false);
    expect(day.dwell.percentile).toBeNull();
    expect(day.eveMargin.percentile).toBeNull();
  });
});

describe('verdicts', () => {
  // Five days, hour 15, single reading each — engineered so day A is extreme
  // on headroom, dwell AND eveMargin (percentile 1.0, the worst of the five
  // on every axis) while day B sits in the middle on all three (percentile
  // 0.75, under the 0.9 extreme cut). Days C/D/E exist only to give the
  // percentile a population wider than one comparison.
  function fiveDayRows(): ArchiveRow[] {
    const plan: Array<{ date: string; surplus: number; eveSurplus: number }> = [
      { date: '2026-06-10', surplus: 200, eveSurplus: 100 }, // A: worst on every axis
      { date: '2026-06-11', surplus: 2000, eveSurplus: 1900 }, // B: middling
      { date: '2026-06-12', surplus: 2200, eveSurplus: 2100 },
      { date: '2026-06-13', surplus: 2600, eveSurplus: 2500 },
      { date: '2026-06-14', surplus: 3000, eveSurplus: 2900 }, // best on every axis
    ];

    const rows: ArchiveRow[] = [];
    for (const { date, surplus, eveSurplus } of plan) {
      rows.push(row(date, 15, surplus, 1000, `${date}T04:00:00Z`));
      const [y, m, d] = date.split('-').map(Number);
      const prev = new Date(Date.UTC(y, m - 1, d - 1));
      const prevDate = prev.toISOString().slice(0, 10);
      rows.push(row(date, 15, eveSurplus, 1000, `${prevDate}T20:00:00Z`));
    }
    return rows;
  }

  const NOW = new Date('2026-06-20T00:00:00Z');

  it('falszywy-alarm: extremeCount >= ALARM_FROM but no event on record', () => {
    const days = studyDays(fiveDayRows(), [], [], NOW);
    const dayA = days.find((d) => d.date === '2026-06-10')!;

    expect(dayA.headroom.extreme).toBe(true);
    expect(dayA.dwell.extreme).toBe(true);
    expect(dayA.eveMargin.extreme).toBe(true);
    expect(dayA.extremeCount).toBeGreaterThanOrEqual(ALARM_FROM);
    expect(dayA.event).toBeNull();
    expect(dayA.verdict).toBe('falszywy-alarm');
  });

  it('przeoczenie: an event is on record but the features stayed quiet (extremeCount < ALARM_FROM)', () => {
    const event: CallEvent = { date: '2026-06-11', hour: 15, kind: 'real', scope: 'market' };
    const days = studyDays(fiveDayRows(), [], [event], NOW);
    const dayB = days.find((d) => d.date === '2026-06-11')!;

    expect(dayB.extremeCount).toBeLessThan(ALARM_FROM);
    expect(dayB.event).toEqual(event);
    expect(dayB.verdict).toBe('przeoczenie');
  });

  it('trafienie: an event is on record AND extremeCount >= ALARM_FROM', () => {
    const event: CallEvent = { date: '2026-06-10', hour: 15, kind: 'real', scope: 'market' };
    const days = studyDays(fiveDayRows(), [], [event], NOW);
    const dayA = days.find((d) => d.date === '2026-06-10')!;

    expect(dayA.extremeCount).toBeGreaterThanOrEqual(ALARM_FROM);
    expect(dayA.verdict).toBe('trafienie');
  });

  it('cisza: no event, and the features stayed quiet', () => {
    const days = studyDays(fiveDayRows(), [], [], NOW);
    const dayC = days.find((d) => d.date === '2026-06-12')!;

    expect(dayC.extremeCount).toBeLessThan(ALARM_FROM);
    expect(dayC.event).toBeNull();
    expect(dayC.verdict).toBe('cisza');
  });

  it('otwarte overrides every other rule: an open day never gets a feature-based verdict', () => {
    const rows: ArchiveRow[] = [row('2026-07-20', 15, 200, 1000, '2026-07-20T02:00:00Z')];
    const event: CallEvent = { date: '2026-07-20', hour: 15, kind: 'real', scope: 'market' };
    const now = new Date('2026-07-20T03:00:00Z'); // well before the 05:00Z deadline

    const [day] = studyDays(rows, [], [event], now);

    expect(day.window.open).toBe(true);
    expect(day.verdict).toBe('otwarte');
  });
});
