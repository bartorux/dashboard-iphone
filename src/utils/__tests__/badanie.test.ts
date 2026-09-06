import { describe, it, expect } from 'vitest';
import fixtureText from '../__fixtures__/pk5l-archiwum-wycinek.jsonl?raw';
import {
  ALARM_FROM,
  DWELL_FLOOR_MW,
  applyObservations,
  buildBadanie,
  buildBadanieWithObservations,
  parseArchiveRows,
  studyDays,
} from '../badanie';
import type { ArchiveRow } from '../pk5lArchive';
import type { CallEvent, CompassVersionRow, Observation } from '../badanieTypes';

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
//
// Auto-selection ranks each candidate hour (12-23) by ITS OWN decision
// window, never by its latest reading overall — an hour's own window is the
// only thing the tool could have known by ITS OWN deadline. Ranking by the
// latest reading instead looks into the future: for 2026-09-02 it picked
// hour 20 off an 857 MW reading taken at 20:05, after the test call period
// had already started.
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

  it('picks the worst hour from each candidate hour\'s OWN decision window, never its latest reading overall', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    // 2026-09-02 carries a CallEvent for hour 20, which is forced regardless
    // of auto-selection. Without that event, auto-selection (measured
    // independently) would have picked hour 19 instead — its own window
    // shows 1141 MW against hour 20's own window at 1142 MW, a 1 MW margin —
    // which is exactly the "event forces the target hour" test below.
    expect(byDate.get('2026-09-02')?.worstHour).toBe(20);

    // 2026-09-01 and 2026-09-03 have no event: auto-selected from each
    // candidate hour's OWN window, not its latest reading overall.
    expect(byDate.get('2026-09-01')?.worstHour).toBe(21);
    expect(byDate.get('2026-09-03')?.worstHour).toBe(20);
  });

  it('pins the window (readAt, surplus, required, margin) for all three days', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    const d0901 = byDate.get('2026-09-01')!;
    expect(d0901.window.open).toBe(false);
    expect(d0901.window.readAt).toBe('2026-09-01T10:07:28.432Z');
    expect(d0901.surplus).toBe(1547);
    expect(d0901.required).toBe(1899);
    expect(d0901.margin).toBe(-352);

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.window.open).toBe(false);
    expect(d0902.window.readAt).toBe('2026-09-02T09:07:24.343Z');
    expect(d0902.surplus).toBe(1142);
    expect(d0902.required).toBe(1995);
    expect(d0902.margin).toBe(-853);

    const d0903 = byDate.get('2026-09-03')!;
    expect(d0903.window.open).toBe(false);
    expect(d0903.window.readAt).toBe('2026-09-03T08:07:31.068Z');
    expect(d0903.surplus).toBe(1864);
    expect(d0903.required).toBe(2101);
    expect(d0903.margin).toBe(-237);
  });

  it('pins headroom, dwell and eveMargin raw values', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    const d0901 = byDate.get('2026-09-01')!;
    expect(d0901.headroom.value).toBe(447); // 1547 - 1100
    expect(d0901.dwell.value).toBe(0);
    expect(d0901.eveMargin.value).toBe(432); // last 2026-08-31 reading: 2331 - 1899

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.headroom.value).toBe(42); // 1142 - 1100
    // Below the 1500 MW floor from 2026-09-01T14:07:29.982Z (first reading
    // after the last at-or-above-floor reading, 1644 MW at 13:07:25Z) through
    // the window reading at 2026-09-02T09:07:24.343Z — 18.998h, rounded to
    // 19.0. (Was pinned at 21 under the old reading-count definition — 21
    // readings, hourly cadence, ~1h apart on average.)
    expect(d0902.dwell.value).toBe(19);
    expect(d0902.eveMargin.value).toBe(-939); // last 2026-09-01 reading: 1056 - 1995

    const d0903 = byDate.get('2026-09-03')!;
    expect(d0903.headroom.value).toBe(764); // 1864 - 1100
    expect(d0903.dwell.value).toBe(0);
    expect(d0903.eveMargin.value).toBe(115); // last 2026-09-02 reading: 2216 - 2101
  });

  it('ranks headroom 1.0 for the worst day, 0.0 for the best, across the 3-day population', () => {
    const days = studyDays(realRows(), [], [REAL_EVENT], REAL_NOW);
    const byDate = new Map(days.map((d) => [d.date, d]));

    // headroom: 09-02 = 42 (worst), 09-01 = 447 (middle), 09-03 = 764 (best).
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

    // dwell: 19 vs 0 vs 0 — 09-02 strictly worse than both others.
    expect(byDate.get('2026-09-02')?.dwell.percentile).toBe(1);
    expect(byDate.get('2026-09-02')?.dwell.extreme).toBe(true);
    expect(byDate.get('2026-09-01')?.dwell.percentile).toBe(0);
    expect(byDate.get('2026-09-03')?.dwell.percentile).toBe(0);

    // eveMargin: -939 (09-02, worst) vs +432 (09-01, best) vs +115 (09-03, middle).
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
    expect(d0901.readings[d0901.readings.length - 1][0]).toBe('2026-09-01T21:07:28.175Z');

    const d0902 = byDate.get('2026-09-02')!;
    expect(d0902.readings.length).toBe(107);

    const d0903 = byDate.get('2026-09-03')!;
    expect(d0903.readings.length).toBe(132);

    // Strictly ascending readAt — the whole study depends on this order.
    for (const day of [d0901, d0902, d0903]) {
      for (let i = 1; i < day.readings.length; i++) {
        expect(Date.parse(day.readings[i][0])).toBeGreaterThanOrEqual(Date.parse(day.readings[i - 1][0]));
      }
    }
  });

  it('event forces the target hour: without it, 2026-09-02 auto-selects hour 19, not 20', () => {
    // On the real data, hour 19's own window (1141 MW) is a hair below hour
    // 20's own window (1142 MW) — auto-selection picks 19 by a 1 MW margin.
    // The CallEvent for hour 20 overrides that, which is the whole point of
    // this rule: what was actually declared, not what the numbers alone
    // would have flagged.
    const rows = realRows();

    const withoutEvent = studyDays(rows, [], [], REAL_NOW);
    const withEvent = studyDays(rows, [], [REAL_EVENT], REAL_NOW);

    const auto = withoutEvent.find((d) => d.date === '2026-09-02')!;
    const forced = withEvent.find((d) => d.date === '2026-09-02')!;

    expect(auto.worstHour).toBe(19);
    expect(auto.event).toBeNull();
    expect(forced.worstHour).toBe(20);
    expect(forced.event).toEqual(REAL_EVENT);
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
  it('picks the EARLIER hour when two candidate hours tie in their OWN windows', () => {
    // A single reading, timestamped 00:00Z — well before every candidate
    // hour's own deadline in this range (even hour 12's, the earliest,
    // whose deadline is 02:00Z that day) — so it lands in every hour's own
    // window unchanged.
    const now = new Date('2026-07-20T00:00:00Z');
    const rows: ArchiveRow[] = [
      // Hour 14 and hour 16 both settle on the same value (900) in their OWN
      // windows — the day's actual minimum. Hour 14 comes first, so it must win.
      row('2026-07-15', 14, 900, 1000, '2026-07-15T00:00:00Z'),
      row('2026-07-15', 16, 900, 1000, '2026-07-15T00:00:00Z'),
      // A clearly higher, non-competing hour, so the tie above is really
      // between 14 and 16 and not an accident of there being only one hour.
      row('2026-07-15', 18, 2000, 1000, '2026-07-15T00:00:00Z'),
    ];

    const [day] = studyDays(rows, [], [], now);

    expect(day.worstHour).toBe(14);
  });

  it('ranks by each hour\'s OWN window, not its latest reading overall: a later, lower reading outside the window must not win', () => {
    // Hour A (12): a SAFE reading inside its own window (deadline 02:00Z),
    // plus a much LOWER reading stamped after that deadline — knowledge the
    // tool could not have had by hour 12's own decision point.
    // Hour B (15): a genuinely worse reading, inside its OWN window
    // (deadline 05:00Z). B must win, even though A's later reading is lower
    // than anything B ever shows.
    const now = new Date('2026-07-20T00:00:00Z');
    const rows: ArchiveRow[] = [
      row('2026-07-16', 12, 3000, 1000, '2026-07-16T00:00:00Z'), // in A's window: safe
      row('2026-07-16', 12, 100, 1000, '2026-07-16T05:00:00Z'), // AFTER A's deadline (02:00Z): must be invisible to selection
      row('2026-07-16', 15, 500, 1000, '2026-07-16T04:00:00Z'), // in B's window (deadline 05:00Z): the real worst
    ];

    const [day] = studyDays(rows, [], [], now);

    expect(day.worstHour).toBe(15);
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
  it('measures the time span from the first below-floor reading to the window reading, and a reading at/above the floor breaks the run — the span starts at the entry AFTER the break', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-08', 15, 2000, 1000, '2026-07-08T00:00:00Z'), // >= floor, before the break — must not be reached
      row('2026-07-08', 15, 1600, 1000, '2026-07-08T01:00:00Z'), // >= floor: the break
      row('2026-07-08', 15, 1200, 1000, '2026-07-08T02:00:00Z'), // < floor — first entry AFTER the break
      row('2026-07-08', 15, 900, 1000, '2026-07-08T03:00:00Z'), // < floor
      row('2026-07-08', 15, 800, 1000, '2026-07-08T04:00:00Z'), // < floor — the window reading
    ];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.window.readAt).toBe('2026-07-08T04:00:00Z');
    // 02:00Z (right after the 1600 MW break) to 04:00Z (the window) — 2h, not
    // the 4h from the very first row, and not a reading count (3).
    expect(day.dwell.value).toBe(2);
  });

  it('reads 0 for a single reading below the floor — nothing to span yet', () => {
    const rows: ArchiveRow[] = [
      row('2026-07-09', 15, 2000, 1000, '2026-07-09T00:00:00Z'), // >= floor
      row('2026-07-09', 15, 900, 1000, '2026-07-09T04:00:00Z'), // < floor — the window reading, alone in its run
    ];
    const now = new Date('2026-07-10T00:00:00Z');

    const [day] = studyDays(rows, [], [], now);

    expect(day.window.readAt).toBe('2026-07-09T04:00:00Z');
    expect(day.dwell.value).toBe(0);
  });

  it('gives the same dwell (±0.1h) for the same real time span whether the archive was sampled hourly or every 15 minutes', () => {
    // Hourly cadence: 3 readings, 1h apart, spanning 2h (02:00Z -> 04:00Z).
    const hourly: ArchiveRow[] = [
      row('2026-07-20', 15, 2000, 1000, '2026-07-20T00:00:00Z'), // >= floor: the break
      row('2026-07-20', 15, 1200, 1000, '2026-07-20T02:00:00Z'), // < floor — first of the run
      row('2026-07-20', 15, 1100, 1000, '2026-07-20T03:00:00Z'), // < floor
      row('2026-07-20', 15, 900, 1000, '2026-07-20T04:00:00Z'), // < floor — the window reading
    ];

    // 15-minute cadence, same real span (02:00Z -> 04:00Z): 9 readings.
    const quarterHourly: ArchiveRow[] = [
      row('2026-07-21', 15, 2000, 1000, '2026-07-21T01:45:00Z'), // >= floor: the break
      ...Array.from({ length: 9 }, (_, i) => {
        const minutes = i * 15;
        const readAt = new Date(Date.UTC(2026, 6, 21, 2, minutes)).toISOString();
        return row('2026-07-21', 15, 900, 1000, readAt); // < floor throughout
      }),
    ];

    const now = new Date('2026-07-25T00:00:00Z');
    const [hourlyDay] = studyDays(hourly, [], [], now);
    const [quarterDay] = studyDays(quarterHourly, [], [], now);

    expect(hourlyDay.dwell.value).toBe(2);
    expect(quarterDay.dwell.value).toBe(2);
    expect(Math.abs(hourlyDay.dwell.value! - quarterDay.dwell.value!)).toBeLessThanOrEqual(0.1);
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
    // Day A's window reading (200 MW) is below the floor on its own, but a
    // single below-floor reading spans 0h (see the `dwell` tests above) —
    // not enough to stay "worst on dwell" once dwell measures a time span
    // instead of a reading count. An earlier same-day reading, also below
    // the floor, gives it an actual 2h span while every other day's single
    // reading (all at/above the floor) still spans 0h.
    rows.push(row('2026-06-10', 15, 300, 1000, '2026-06-10T02:00:00Z'));
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

// ---------------------------------------------------------------------------
// applyObservations — merging the register (file.events) with Issue reports.
// Uses the real archive slice: 2026-09-02 carries REAL_EVENT (register),
// 2026-09-01 and -03 have no event and verdict 'cisza'.
// ---------------------------------------------------------------------------

describe('applyObservations', () => {
  it('the register wins a same-date conflict against an Issue observation', () => {
    const file = buildBadanie(realRows(), [], [REAL_EVENT], REAL_NOW);
    const issueObservation: Observation = {
      date: '2026-09-02',
      outcome: 'real',
      hour: 5,
      scope: 'market',
      source: 'issue',
      issueNumber: 42,
    };

    const applied = applyObservations(file, [issueObservation]);
    const day = applied.days.find((d) => d.date === '2026-09-02')!;

    expect(day.observation).toEqual({
      date: '2026-09-02',
      outcome: 'test',
      hour: 20,
      scope: 'unit',
      note: REAL_EVENT.note,
      source: 'register',
    });
    // The conflict is resolved for the label only — scoring never re-runs here.
    expect(day.verdict).toBe('trafienie');
    expect(day.worstHour).toBe(20);
  });

  it('an Issue observation for a date the register knows nothing about is kept as-is', () => {
    const file = buildBadanie(realRows(), [], [REAL_EVENT], REAL_NOW);
    const issueObservation: Observation = {
      date: '2026-09-01',
      outcome: 'none',
      source: 'issue',
      issueNumber: 7,
    };

    const applied = applyObservations(file, [issueObservation]);
    const day = applied.days.find((d) => d.date === '2026-09-01')!;

    expect(day.observation).toEqual(issueObservation);
  });

  it('a "none" observation is visible on the day but never changes its verdict', () => {
    const file = buildBadanie(realRows(), [], [], REAL_NOW); // no register event anywhere
    const before = file.days.find((d) => d.date === '2026-09-01')!;
    expect(before.verdict).toBe('cisza');

    const applied = applyObservations(file, [
      { date: '2026-09-01', outcome: 'none', source: 'issue', issueNumber: 1 },
    ]);
    const after = applied.days.find((d) => d.date === '2026-09-01')!;

    expect(after.observation?.outcome).toBe('none');
    expect(after.verdict).toBe('cisza'); // unchanged
    expect(after.worstHour).toBe(before.worstHour); // unchanged
    expect(after.extremeCount).toBe(before.extremeCount); // unchanged
  });

  it('days with neither a register event nor an Issue observation get observation: null', () => {
    const file = buildBadanie(realRows(), [], [], REAL_NOW);
    const applied = applyObservations(file, []);
    for (const day of applied.days) {
      expect(day.observation).toBeNull();
    }
  });

  it('lists observations newest date first', () => {
    const file = buildBadanie(realRows(), [], [], REAL_NOW);
    const applied = applyObservations(file, [
      { date: '2026-09-01', outcome: 'none', source: 'issue', issueNumber: 1 },
      { date: '2026-09-03', outcome: 'none', source: 'issue', issueNumber: 2 },
    ]);

    expect(applied.observations.map((o) => o.date)).toEqual(['2026-09-03', '2026-09-01']);
  });
});

// ---------------------------------------------------------------------------
// buildBadanieWithObservations — rescoring a day off an Issue's test/real
// report when the register itself has nothing for that date.
// ---------------------------------------------------------------------------

describe('buildBadanieWithObservations', () => {
  it('forces the target hour from an Issue test/real observation on a day the register has nothing for', () => {
    const now = new Date('2026-07-20T00:00:00Z');
    const rows: ArchiveRow[] = [
      // Auto-selection would pick hour 12 (lower surplus, in its own window).
      row('2026-07-16', 12, 100, 1000, '2026-07-16T00:00:00Z'),
      // The hour the Issue reports as the actual call period.
      row('2026-07-16', 18, 3000, 1000, '2026-07-16T00:00:00Z'),
    ];
    const issueObservations: Observation[] = [
      { date: '2026-07-16', outcome: 'test', hour: 18, scope: 'unit', source: 'issue', issueNumber: 3 },
    ];

    const withoutIssue = buildBadanie(rows, [], [], now);
    expect(withoutIssue.days[0].worstHour).toBe(12);

    const withIssue = buildBadanieWithObservations(rows, [], [], issueObservations, now);
    const day = withIssue.days[0];

    expect(day.worstHour).toBe(18); // forced to the reported hour, not auto-selected
    expect(day.event).toEqual({ date: '2026-07-16', hour: 18, kind: 'test', scope: 'unit' });
    expect(day.observation).toEqual({
      date: '2026-07-16',
      outcome: 'test',
      hour: 18,
      scope: 'unit',
      source: 'issue',
      issueNumber: 3,
    });
    // The synthetic event drives scoring and shows up in the aggregate list...
    expect(withIssue.events).toEqual([{ date: '2026-07-16', hour: 18, kind: 'test', scope: 'unit' }]);
  });

  it('a "none" observation from an Issue never becomes a scoring event, even on a day the register has nothing for', () => {
    const now = new Date('2026-07-20T00:00:00Z');
    const rows: ArchiveRow[] = [
      row('2026-07-16', 12, 100, 1000, '2026-07-16T00:00:00Z'), // auto-selected: lowest own-window surplus
      row('2026-07-16', 18, 3000, 1000, '2026-07-16T00:00:00Z'),
    ];
    const issueObservations: Observation[] = [
      { date: '2026-07-16', outcome: 'none', source: 'issue', issueNumber: 4 },
    ];

    const result = buildBadanieWithObservations(rows, [], [], issueObservations, now);
    const day = result.days[0];

    expect(day.worstHour).toBe(12); // untouched by the "none" report — still auto-selected
    expect(day.event).toBeNull(); // "none" must never become a CallEvent
    expect(day.observation).toEqual({
      date: '2026-07-16',
      outcome: 'none',
      source: 'issue',
      issueNumber: 4,
    });
  });

  it('the register wins per date: an Issue test/real report for a date the register already covers changes neither the score nor the label', () => {
    const now = new Date('2026-07-20T00:00:00Z');
    const rows: ArchiveRow[] = [
      row('2026-07-16', 12, 100, 1000, '2026-07-16T00:00:00Z'),
      row('2026-07-16', 18, 3000, 1000, '2026-07-16T00:00:00Z'),
    ];
    const registerEvent: CallEvent = { date: '2026-07-16', hour: 12, kind: 'real', scope: 'market' };
    const issueObservations: Observation[] = [
      { date: '2026-07-16', outcome: 'test', hour: 18, scope: 'unit', source: 'issue', issueNumber: 9 },
    ];

    const result = buildBadanieWithObservations(rows, [], [registerEvent], issueObservations, now);
    const day = result.days[0];

    expect(day.worstHour).toBe(12); // register's own hour, not the Issue's 18
    expect(day.event).toEqual(registerEvent);
    expect(day.observation).toEqual({
      date: '2026-07-16',
      outcome: 'real',
      hour: 12,
      scope: 'market',
      note: undefined,
      source: 'register',
    });
  });

  it('an Issue test observation on an otherwise-quiet day flips the verdict to trafienie once extremeCount reaches ALARM_FROM', () => {
    // Three days, one reading each at hour 15 plus its D-1 evening reading;
    // 2026-08-10 is engineered to be the worst on headroom, dwell AND
    // eveMargin against the other two — extremeCount 3, meeting ALARM_FROM —
    // exactly the "falszywy-alarm" shape from the `verdicts` tests above,
    // reused here to isolate the ONE thing this test is about: an event
    // arriving via an Issue instead of the register flips that verdict to
    // 'trafienie', the same as a register event would.
    function threeDayRows(): ArchiveRow[] {
      const plan: Array<{ date: string; surplus: number; eveSurplus: number }> = [
        { date: '2026-08-10', surplus: 200, eveSurplus: 100 }, // worst on every axis
        { date: '2026-08-11', surplus: 2000, eveSurplus: 1900 },
        { date: '2026-08-12', surplus: 3000, eveSurplus: 2900 },
      ];
      const rows: ArchiveRow[] = [];
      for (const { date, surplus, eveSurplus } of plan) {
        rows.push(row(date, 15, surplus, 1000, `${date}T04:00:00Z`));
        const [y, m, d] = date.split('-').map(Number);
        const prev = new Date(Date.UTC(y, m - 1, d - 1));
        const prevDate = prev.toISOString().slice(0, 10);
        rows.push(row(date, 15, eveSurplus, 1000, `${prevDate}T20:00:00Z`));
      }
      // Same reasoning as `fiveDayRows` above: a single below-floor reading
      // spans 0h, so 08-10 needs an earlier same-day below-floor reading to
      // stay "worst on dwell" too (extremeCount must still reach 3).
      rows.push(row('2026-08-10', 15, 300, 1000, '2026-08-10T02:00:00Z'));
      return rows;
    }

    const now = new Date('2026-08-20T00:00:00Z');
    const rows = threeDayRows();

    const withoutObservation = studyDays(rows, [], [], now);
    const dayWithout = withoutObservation.find((d) => d.date === '2026-08-10')!;
    expect(dayWithout.extremeCount).toBeGreaterThanOrEqual(ALARM_FROM);
    expect(dayWithout.verdict).toBe('falszywy-alarm');

    const issueObservations: Observation[] = [
      { date: '2026-08-10', outcome: 'test', hour: 15, scope: 'unit', source: 'issue', issueNumber: 11 },
    ];
    const withObservation = buildBadanieWithObservations(rows, [], [], issueObservations, now);
    const dayWith = withObservation.days.find((d) => d.date === '2026-08-10')!;

    expect(dayWith.extremeCount).toBeGreaterThanOrEqual(ALARM_FROM);
    expect(dayWith.event).not.toBeNull();
    expect(dayWith.verdict).toBe('trafienie');
  });
});
