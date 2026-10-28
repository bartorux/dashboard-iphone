import { describe, it, expect } from 'vitest';
import { evaluateEstimates } from '../saldoOcena';
import type { ArchiveRow } from '../pk5lArchive';
import type { EstimateLogRow } from '../saldoSzacunek';

/*
 * Thursday 29.10.2026, CET (UTC+1). An hour's deadline is its Warsaw start
 * minus 8 h: 07:00 → 28.10 22:00 UTC, 19:00 → 29.10 10:00 UTC, 21:00 → 29.10
 * 12:00 UTC.
 */
const DAY = '2026-10-29';
const PLACEHOLDER_AT = '2026-10-28T12:00:00.000Z';
const ARRIVED_AT = '2026-10-28T12:15:00.000Z';
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WINDOW = HOURS.filter((hour) => hour >= 7 && hour <= 21);

const reading = (hour: number, surplus: number, exchange: number, readAt: string, date = DAY): ArchiveRow => [
  date, hour, surplus, 3000, '', readAt, exchange,
];

/** Before the plan a 100 MW deficit everywhere; the plan brings 1500 MW in and 1400 MW of reserve. */
const archive = (date = DAY): ArchiveRow[] => [
  ...HOURS.map((hour) => reading(hour, 2900, -12, PLACEHOLDER_AT, date)),
  ...HOURS.map((hour) => reading(hour, 4300, 1500, ARRIVED_AT, date)),
];

const estimate = (
  hour: number, h: number, method: EstimateLogRow[3], mw: number,
  p10: number | null, p90: number | null, readAt: string, date = DAY
): EstimateLogRow => [date, hour, h, method, mw, p10, p90, readAt];

const log = (date = DAY): EstimateLogRow[] => [
  ...WINDOW.map((hour) => estimate(hour, 2, 'e5', 1000, -500, 2500, '2026-10-27T15:00:00.000Z', date)),
  ...WINDOW.map((hour) => estimate(hour, 1, 'e5', 1400, 0, 2800, '2026-10-28T11:00:00.000Z', date)),
  ...WINDOW.map((hour) => estimate(hour, 1, 'pwm-rdn', 1480, null, null, '2026-10-28T12:05:00.000Z', date)),
  // Written after the plan arrived: must not count.
  ...WINDOW.map((hour) => estimate(hour, 1, 'e5', 9999, 9000, 9999, '2026-10-28T12:30:00.000Z', date)),
];

const CLOSED = new Date('2026-10-29T21:00:00.000Z');

describe('evaluateEstimates', () => {
  it('scores each horizon and method by the estimate that stood last before the plan', () => {
    const [day] = evaluateEstimates(log(), archive(), CLOSED).days;
    expect(day).toMatchObject({ businessDate: DAY, workingDay: true, arrivedAt: ARRIVED_AT, arrivalGapMin: 15, closed: true });
    expect(day.errors).toEqual([
      { method: 'placeholder', h: null, hours: 15, mae: 1512, maeAtDeadline: 1512, coverage: null },
      { method: 'e5', h: 1, hours: 15, mae: 100, maeAtDeadline: 100, coverage: 1 },
      { method: 'e5', h: 2, hours: 15, mae: 500, maeAtDeadline: 500, coverage: 1 },
      { method: 'pwm-rdn', h: 1, hours: 15, mae: 20, maeAtDeadline: 20, coverage: null },
    ]);
  });

  it('judges against the plan at each deadline: a revision before it counts, one after it does not', () => {
    const rows = [
      ...archive(),
      reading(7, 4500, 1700, '2026-10-28T20:00:00.000Z'), // before 07:00's deadline (22:00 UTC)
      reading(21, 4300, 100, '2026-10-29T13:00:00.000Z'), // after 21:00's deadline (12:00 UTC)
    ];
    const e5 = evaluateEstimates(log(), rows, CLOSED).days[0].errors.find((entry) => entry.method === 'e5' && entry.h === 1)!;
    expect(e5.mae).toBe(100);
    expect(e5.maeAtDeadline).toBe(Math.round((14 * 100 + 300) / 15));
  });

  it('counts the band only where the first plan fell inside it', () => {
    const rows = [...archive(), ...[7, 8, 9].map((hour) => reading(hour, 4300, 3500, ARRIVED_AT))];
    const e5 = evaluateEstimates(log(), rows, CLOSED).days[0].errors.find((entry) => entry.method === 'e5' && entry.h === 1)!;
    expect(e5.coverage).toBe(0.8); // 12 of 15
  });

  it('PSE alone false-alarms the day; the estimate folded in calls it calm', () => {
    const file = evaluateEstimates(log(), archive(), CLOSED);
    // 2900 + k × (1400 − (−12)) − 3000 ≥ 0 for k = 0.5 and 0.9.
    expect(file.days[0].verdicts).toEqual({ pse: 'false-alarm', k05: 'calm', k09: 'calm' });
    expect(file.totals.verdicts).toMatchObject({ days: 1, pse: { 'false-alarm': 1 }, k05: { calm: 1 } });
  });

  it('tells k = 0.5 from k = 0.9: a 900 MW deficit before the plan survives half the estimated import', () => {
    const rows = [...archive(), reading(19, 2100, -12, '2026-10-28T12:05:00.000Z')];
    // 2100 + 0.5 × 1412 − 3000 = −194; 2100 + 0.9 × 1412 − 3000 = +371. The
    // market result written later stays out: the verdict asks about the
    // estimate a reader would have had for most of the day.
    const market = estimate(19, 1, 'pwm-rdn', 4000, null, null, '2026-10-28T12:10:00.000Z');
    expect(evaluateEstimates([...log(), market], rows, CLOSED).days[0].verdicts).toEqual({ pse: 'false-alarm', k05: 'false-alarm', k09: 'calm' });
  });

  it('and misses a deficit that is still there at the deadline — the trade measured in the backtest', () => {
    const rows = [...archive(), reading(19, 2500, 1500, '2026-10-28T20:00:00.000Z')];
    const file = evaluateEstimates(log(), rows, CLOSED);
    expect(file.days[0].verdicts).toEqual({ pse: 'hit', k05: 'missed', k09: 'missed' });
    expect(file.stage3.missed).toEqual({ pse: 0, k05: 1, k09: 1 });
  });

  it('keeps an open day out of the verdicts and scores the deadline only where it has passed', () => {
    const [day] = evaluateEstimates(log(), [...archive(), reading(7, 4500, 1700, '2026-10-28T20:00:00.000Z')], new Date('2026-10-28T22:30:00.000Z')).days;
    expect(day.closed).toBe(false);
    expect(day.verdicts).toBeNull();
    expect(day.errors.find((entry) => entry.method === 'e5' && entry.h === 1)!.maeAtDeadline).toBe(300);
  });

  it('gives no verdict to a day read hours before the plan, as during the heartbeat outage', () => {
    const stale = archive().map((row): ArchiveRow =>
      row[5] === PLACEHOLDER_AT ? [row[0], row[1], row[2], row[3], row[4], '2026-10-28T06:00:00.000Z', row[6]] : row
    );
    const [day] = evaluateEstimates(log(), stale, CLOSED).days;
    expect(day).toMatchObject({ arrivalGapMin: 375, closed: true, verdicts: null });
    expect(day.errors).toHaveLength(4);
  });

  it('gives a Saturday errors but no verdict, and leaves out a day the plan has not reached', () => {
    const saturday = '2026-10-31';
    const pending = '2026-11-02';
    const file = evaluateEstimates(
      [...log(saturday), ...log(pending)],
      [...archive(saturday), ...HOURS.map((hour) => reading(hour, 2900, -12, PLACEHOLDER_AT, pending))],
      new Date('2026-11-01T21:00:00.000Z')
    );
    expect(file.days.map((day) => day.businessDate)).toEqual([saturday]);
    expect(file.days[0]).toMatchObject({ workingDay: false, verdicts: null });
    expect(file.days[0].errors).toHaveLength(4);
  });

  it('adds the days up by the hour, and reports the bar for stage 3', () => {
    const friday = '2026-10-30';
    const shift = (row: ArchiveRow): ArchiveRow => [friday, row[1], row[2], row[3], row[4], row[5].replace('2026-10-28', '2026-10-29').replace('2026-10-27', '2026-10-28'), row[6]];
    const shiftLog = (row: EstimateLogRow): EstimateLogRow => [friday, row[1], row[2], row[3], row[4], row[5], row[6], row[7].replace('2026-10-28', '2026-10-29').replace('2026-10-27', '2026-10-28')];
    const file = evaluateEstimates(
      [...log(), ...log().map(shiftLog)],
      [...archive(), ...archive().map(shift)],
      new Date('2026-10-30T21:00:00.000Z')
    );
    expect(file.totals.errors.find((entry) => entry.method === 'e5' && entry.h === 1)).toMatchObject({ hours: 30, mae: 100 });
    expect(file.stage3).toEqual({
      workingDays: 2,
      workingDaysNeeded: 15,
      coverage: 1,
      coverageNeeded: 0.75,
      missed: { pse: 0, k05: 0, k09: 0 },
    });
  });

  it('ignores lines read after `now`', () => {
    const early = new Date('2026-10-28T10:00:00.000Z');
    expect(evaluateEstimates(log(), archive(), early).days).toEqual([]);
  });
});
