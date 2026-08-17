import { describe, it, expect } from 'vitest';
import {
  EMPTY_LOG,
  crossingsFor,
  describeSettling,
  appendEntry,
  parseLog,
  sameDays,
  snapshotDay,
  snapshotDays,
  describeMovement,
  movementFor,
  type DaySnapshot,
} from '../forecastLog';
import { makePoint } from '../../test/factories';

/** Builds a block on a given business date, stamped the way PSE stamps them. */
function hourOn(
  businessDate: string,
  startHour: number,
  overrides: Partial<Parameters<typeof makePoint>[0]> = {}
) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return makePoint({
    businessDate,
    hourLabel: `${pad(startHour)}:00`,
    endLabel: `${pad((startHour + 1) % 24)}:00`,
    time: new Date(`${businessDate}T${pad((startHour + 1) % 24)}:00:00Z`),
    ...overrides,
  });
}

/** 2026-08-12 is a Wednesday. */
const WEDNESDAY = '2026-08-12';
/** 2026-08-15 is a Saturday. */
const SATURDAY = '2026-08-15';

describe('snapshotDay', () => {
  it('aggregates only the hours a call period could fall in', () => {
    const points = [
      // 03:00 is outside the window and carries the day's worst margin by far.
      hourOn(WEDNESDAY, 3, { reserve: 1000, required: 3000 }),
      hourOn(WEDNESDAY, 8, { reserve: 3000, required: 2000 }),
      hourOn(WEDNESDAY, 20, { reserve: 2200, required: 2000 }),
    ];

    const snapshot = snapshotDay(points, WEDNESDAY);

    expect(snapshot.worstMargin).toBe(200);
    expect(snapshot.worstHour).toBe('20:00');
    // (1000 + 200) / 2 — the night hour is absent from the average too.
    expect(snapshot.averageMargin).toBe(600);
  });

  it('does not change when the day is half spent', () => {
    // The trap this whole module has to avoid: aggregating over "hours still
    // ahead" would shrink the set as the day passes and report movement on a
    // forecast that had not moved. The snapshot takes no clock at all, so the
    // same points must produce the same answer whenever it is called.
    const points = [
      hourOn(WEDNESDAY, 8, { reserve: 3000, required: 2000 }),
      hourOn(WEDNESDAY, 20, { reserve: 2200, required: 2000 }),
    ];

    const morning = snapshotDay(points, WEDNESDAY);
    const evening = snapshotDay(points, WEDNESDAY);

    expect(evening).toEqual(morning);
    expect(evening.averageMargin).toBe(600);
  });

  it('reports nothing for a day off, where no call period can fall', () => {
    const snapshot = snapshotDay(
      [hourOn(SATURDAY, 20, { reserve: 2200, required: 2000 })],
      SATURDAY
    );

    expect(snapshot).toEqual({
      businessDate: SATURDAY,
      worstMargin: null,
      averageMargin: null,
      worstHour: null,
    });
  });

  it('skips hours with missing readings rather than treating them as zero', () => {
    const points = [
      hourOn(WEDNESDAY, 8, { reserve: null, required: null }),
      hourOn(WEDNESDAY, 20, { reserve: 2200, required: 2000 }),
    ];

    const snapshot = snapshotDay(points, WEDNESDAY);

    expect(snapshot.worstMargin).toBe(200);
    expect(snapshot.averageMargin).toBe(200);
  });

  it('ignores points belonging to other days', () => {
    const points = [
      hourOn(WEDNESDAY, 20, { reserve: 2200, required: 2000 }),
      hourOn('2026-08-13', 20, { reserve: 100, required: 2000 }),
    ];

    expect(snapshotDay(points, WEDNESDAY).worstMargin).toBe(200);
  });

  it('records the real revision measured on 11 August', () => {
    // The forecast for Wednesday 20:00 read +139 MW at 11:20 and +1331 MW two
    // hours later. Two snapshots of the same day have to preserve that
    // difference — this is the case the feature exists for.
    const before = snapshotDay(
      [hourOn(WEDNESDAY, 20, { reserve: 1916, required: 1777 })],
      WEDNESDAY
    );
    const after = snapshotDay(
      [hourOn(WEDNESDAY, 20, { reserve: 3108, required: 1777 })],
      WEDNESDAY
    );

    expect(before.worstMargin).toBe(139);
    expect(after.worstMargin).toBe(1331);
    expect(sameDays([before], [after])).toBe(false);
  });
});

describe('snapshotDays', () => {
  it('keeps the requested order, including days with no data', () => {
    const points = [hourOn(WEDNESDAY, 20, { reserve: 2200, required: 2000 })];

    const days = snapshotDays(points, [WEDNESDAY, '2026-08-13']);

    expect(days.map((day) => day.businessDate)).toEqual([
      WEDNESDAY,
      '2026-08-13',
    ]);
    expect(days[1].worstMargin).toBeNull();
  });
});

const day = (overrides: Partial<DaySnapshot> = {}): DaySnapshot => ({
  businessDate: WEDNESDAY,
  worstMargin: 200,
  averageMargin: 600,
  worstHour: '20:00',
  ...overrides,
});

describe('sameDays', () => {
  it('separates snapshots that differ only in the worst hour', () => {
    // The day's minimum moving from evening to morning is real news even when
    // the figure happens to match.
    expect(sameDays([day()], [day({ worstHour: '08:00' })])).toBe(false);
  });

  it('separates snapshots that differ only in the average', () => {
    expect(sameDays([day()], [day({ averageMargin: 900 })])).toBe(false);
  });

  it('holds identical snapshots equal', () => {
    expect(sameDays([day()], [day()])).toBe(true);
  });

  it('separates different day counts', () => {
    expect(sameDays([day()], [day(), day({ businessDate: '2026-08-13' })])).toBe(
      false
    );
  });
});

describe('appendEntry', () => {
  it('writes nothing when the forecast has not moved', () => {
    const log = appendEntry(EMPTY_LOG, { at: '2026-08-11T10:37:00Z', days: [day()] });
    const again = appendEntry(log, { at: '2026-08-11T11:37:00Z', days: [day()] });

    expect(again.entries).toHaveLength(1);
    expect(again.entries[0].at).toBe('2026-08-11T10:37:00Z');
  });

  it('appends when the forecast moved', () => {
    const log = appendEntry(EMPTY_LOG, { at: '2026-08-11T10:37:00Z', days: [day()] });
    const moved = appendEntry(log, {
      at: '2026-08-11T11:37:00Z',
      days: [day({ worstMargin: 1331 })],
    });

    expect(moved.entries).toHaveLength(2);
    expect(moved.entries[1].days[0].worstMargin).toBe(1331);
  });

  it('drops the oldest entries past the limit', () => {
    let log = EMPTY_LOG;
    for (let index = 0; index < 5; index++) {
      log = appendEntry(
        log,
        { at: `2026-08-11T0${index}:37:00Z`, days: [day({ worstMargin: index })] },
        3
      );
    }

    expect(log.entries).toHaveLength(3);
    expect(log.entries.map((entry) => entry.days[0].worstMargin)).toEqual([2, 3, 4]);
  });

  it('leaves the original log untouched', () => {
    const log = appendEntry(EMPTY_LOG, { at: '2026-08-11T10:37:00Z', days: [day()] });
    appendEntry(log, { at: '2026-08-11T11:37:00Z', days: [day({ worstMargin: 1331 })] });

    expect(log.entries).toHaveLength(1);
  });
});

describe('parseLog', () => {
  it('keeps a well-formed log', () => {
    const raw = { entries: [{ at: '2026-08-11T10:37:00Z', days: [day()] }] };

    expect(parseLog(raw).entries).toHaveLength(1);
  });

  it.each([
    ['null', null],
    ['a string', 'nonsense'],
    ['an object without entries', { other: 1 }],
    ['entries that are not an array', { entries: 'no' }],
  ])('treats %s as no history', (_label, raw) => {
    expect(parseLog(raw)).toEqual(EMPTY_LOG);
  });

  it('drops entries with an unusable timestamp', () => {
    const raw = {
      entries: [
        { at: 'kiedys', days: [] },
        { at: '2026-08-11T10:37:00Z', days: [] },
      ],
    };

    expect(parseLog(raw).entries).toHaveLength(1);
  });
});

describe('crossingsFor i describeSettling', () => {
  /** A log of one day whose worst margin walks through the given values. */
  const logZ = (wartosci: number[]) => ({
    entries: wartosci.map((m, i) => ({
      at: new Date(Date.UTC(2026, 7, 11, i)).toISOString(),
      days: [
        { businessDate: WEDNESDAY, worstMargin: m, averageMargin: m, worstHour: '20:00' },
      ],
    })),
  });

  // Written out rather than generated. The first version of this fixture used a
  // formula and produced three crossings where it claimed one — the test failed
  // for a reason that had nothing to do with the code under it.
  const DWA_PRZEJSCIA = [-300, -300, -300, -300, -300, -300, -300, -300, -300, 300, 300, -300];
  const JEDNO_PRZEJSCIE = [-300, -300, -300, -300, -300, -300, -300, -300, -300, -300, -300, 300];

  it('speaks up once a day has changed its mind twice', () => {
    /*
     * The case this exists for. On 16 August the forecast for the next day went
     * from -1935 MW to +406 MW between 10:55 and 11:53 — the day changed state
     * inside one hour, and the card said only that it was sliding.
     */
    expect(crossingsFor(logZ(DWA_PRZEJSCIA), WEDNESDAY)).toBe(2);
    expect(describeSettling(crossingsFor(logZ(DWA_PRZEJSCIA), WEDNESDAY))).toContain(
      'jeszcze się ustala'
    );

    expect(crossingsFor(logZ(JEDNO_PRZEJSCIE), WEDNESDAY)).toBe(1);
    expect(describeSettling(crossingsFor(logZ(JEDNO_PRZEJSCIE), WEDNESDAY))).toBeNull();
  });

  it('ignores a day that swings wildly without changing state', () => {
    // -2000 to -100 is a bigger move than anything above, and means nothing
    // here: the reserve fails to cover the required level throughout, so the
    // reader's answer never changes.
    const dzikie = [-2000, -100, -1900, -200, -1800, -150, -2000, -120, -1700, -300, -1950, -180];
    expect(crossingsFor(logZ(dzikie), WEDNESDAY)).toBe(0);
    expect(describeSettling(crossingsFor(logZ(dzikie), WEDNESDAY))).toBeNull();
  });

  it('counts only the recent window, not the whole series', () => {
    // A day that thrashed yesterday and has held steady since HAS settled.
    // Without this the warning would outlive the thing it warns about — the
    // assertion catches a window taken from the start of the series.
    const dawno = [300, -300, 300, -300, 300, -300, ...Array(12).fill(-500)];
    expect(crossingsFor(logZ(dawno), WEDNESDAY)).toBe(0);
  });

  it('says nothing until there are enough readings', () => {
    expect(crossingsFor(logZ([300, -300, 300, -300]), WEDNESDAY)).toBeNull();
    expect(describeSettling(null)).toBeNull();
  });
});

describe('movementFor', () => {
  /** A log of one day whose worst margin walks through the given values. */
  const logZ = (wartosci: number[]) => ({
    entries: wartosci.map((m, i) => ({
      at: new Date(Date.UTC(2026, 7, 11, i)).toISOString(),
      days: [
        { businessDate: WEDNESDAY, worstMargin: m, averageMargin: m, worstHour: '20:00' },
      ],
    })),
  });

  it('compares medians of windows, not the first and last reading', () => {
    /*
     * The measurement this rule exists for. On 12 August the day drifted about
     * 1000 MW across 31 hours while a single hour-to-hour step reached 1339 —
     * so a difference between two readings can exceed the whole day's movement
     * and would report a slide that reverses an hour later.
     *
     * Here the last reading spikes upward; the windowed median ignores it.
     */
    const ruch = movementFor(
      logZ([1000, 1000, 1000, 1000, 1000, 1000, 200, 200, 200, 200, 200, 5000]),
      WEDNESDAY
    );

    expect(ruch!.shift).toBeLessThan(0);
  });

  it('reports nothing until there are enough snapshots', () => {
    expect(movementFor(logZ([1000, 500, 200]), WEDNESDAY)).toBeNull();
  });

  it('never reports a jumpiness of zero', () => {
    // A flat day would otherwise make every later comparison divide by nothing.
    expect(movementFor(logZ(Array(14).fill(1000)), WEDNESDAY)!.jumpiness).toBe(1);
  });
});

describe('describeMovement', () => {
  it('stays silent below the attention threshold', () => {
    // 400 MW cannot move any hour across the level at which this app starts
    // calling a margin worth watching.
    expect(describeMovement({ shift: -400, jumpiness: 10 })).toBeNull();
  });

  it('stays silent when the day is simply that jumpy', () => {
    // Same shift, but on a day that wobbles by 400 MW between snapshots anyway.
    expect(describeMovement({ shift: -900, jumpiness: 400 })).toBeNull();
    expect(describeMovement({ shift: -900, jumpiness: 20 })).not.toBeNull();
  });

  it('names the direction and nothing else', () => {
    const gorzej = describeMovement({ shift: -1863, jumpiness: 22 });
    const lepiej = describeMovement({ shift: 900, jumpiness: 20 });

    expect(gorzej).toBe('prognoza tej doby pogarsza się');
    expect(lepiej).toBe('prognoza tej doby poprawia się');
    // No figure and no span: the model may not print digits outside an hour, so
    // a fact carrying either would hand it what the validator then refuses.
    expect(gorzej).not.toMatch(/\d/);
  });

  it('says nothing when there is no measurement at all', () => {
    expect(describeMovement(null)).toBeNull();
  });
});
