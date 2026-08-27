import { describe, it, expect } from 'vitest';
import { PSERedispatchRawItem } from '../../types';
import { processRedispatch, redispatchByHour, hasCurtailment } from '../redispatch';

/**
 * Builds one 15-minute row. `dtimeUtc` is written the way poze-redoze
 * actually sends it — no seconds ("2026-08-04 08:15") — since that shape,
 * not the seconds-carrying one pk5l-wp uses, is what production traffic
 * looks like (confirmed against a live response).
 */
function row(overrides: Partial<PSERedispatchRawItem> & { dtimeUtc: string }): PSERedispatchRawItem {
  const { dtimeUtc, ...rest } = overrides;
  return {
    business_date: '2026-08-04',
    dtime: '2026-08-04 10:15:00',
    dtime_utc: dtimeUtc,
    pv_red_network: null,
    pv_red_balance: null,
    wi_red_network: null,
    wi_red_balance: null,
    ...rest,
  };
}

describe('processRedispatch — averaging', () => {
  it('averages the 4 quarters of a full hour, not the sum', () => {
    // Hour 08:00-09:00 local = 06:00-07:00 UTC. Quarters end at 06:15, 06:30,
    // 06:45, 07:00 UTC — the last one lands exactly on the next hour mark.
    const raw = [
      row({ dtimeUtc: '2026-08-04 06:15', pv_red_balance: -400 }),
      row({ dtimeUtc: '2026-08-04 06:30', pv_red_balance: -800 }),
      row({ dtimeUtc: '2026-08-04 06:45', pv_red_balance: -1200 }),
      row({ dtimeUtc: '2026-08-04 07:00', pv_red_balance: -1600 }),
    ];

    const hours = processRedispatch(raw);

    expect(hours).toHaveLength(1);
    // (400+800+1200+1600)/4 = 1000, not the sum 4000
    expect(hours[0].pvRed).toBe(-1000);
    expect(hours[0].hourStartMs).toBe(Date.parse('2026-08-04T06:00:00.000Z'));
    expect(hours[0].businessDate).toBe('2026-08-04');
  });

  it('sums network and balance rather than reading only one field', () => {
    // Today's real feed puts curtailment in *_balance with *_network null, but
    // the fields are not mutually exclusive by contract, so both must count.
    const raw = [
      row({ dtimeUtc: '2026-08-04 06:15', pv_red_network: -100, pv_red_balance: -50 }),
      row({ dtimeUtc: '2026-08-04 06:30', pv_red_network: -100, pv_red_balance: -50 }),
      row({ dtimeUtc: '2026-08-04 06:45', pv_red_network: -100, pv_red_balance: -50 }),
      row({ dtimeUtc: '2026-08-04 07:00', pv_red_network: -100, pv_red_balance: -50 }),
    ];

    const hours = processRedispatch(raw);

    expect(hours[0].pvRed).toBe(-150);
  });

  it('treats null as zero curtailment, not as a missing reading to exclude', () => {
    const raw = [
      row({ dtimeUtc: '2026-08-04 06:15', pv_red_balance: -1000 }),
      row({ dtimeUtc: '2026-08-04 06:30', pv_red_balance: null }),
      row({ dtimeUtc: '2026-08-04 06:45', pv_red_balance: null }),
      row({ dtimeUtc: '2026-08-04 07:00', pv_red_balance: null }),
    ];

    const hours = processRedispatch(raw);

    // (1000+0+0+0)/4 = 250. Excluding the nulls from the count would give 1000.
    expect(hours[0].pvRed).toBe(-250);
  });

  it('divides by however many quarters actually landed in the hour, not by 4', () => {
    // A boundary row missing (day starting mid-window, or dropped upstream):
    // three quarters present, must divide by 3.
    const raw = [
      row({ dtimeUtc: '2026-08-04 06:15', pv_red_balance: -300 }),
      row({ dtimeUtc: '2026-08-04 06:30', pv_red_balance: -300 }),
      row({ dtimeUtc: '2026-08-04 06:45', pv_red_balance: -300 }),
    ];

    const hours = processRedispatch(raw);

    expect(hours[0].pvRed).toBe(-300);
  });

  it('files the quarter ending exactly on the hour mark into the hour it closes, not the one it opens', () => {
    // dtime_utc is the END of the quarter, so the 4th quarter of 06:00-07:00
    // (the 06:45-07:00 period) reports dtime_utc "07:00" — the same instant
    // that also opens 07:00-08:00. A plain floor(ms / HOUR_MS) would misfile
    // that quarter into 07:00-08:00 instead, silently shifting every hour of
    // every day by one quarter (every hour's 4th quarter always lands exactly
    // on the boundary — this is not a rare case).
    const raw = [
      row({ dtimeUtc: '2026-08-04 06:45', pv_red_balance: -1000 }), // period 06:30-06:45
      row({ dtimeUtc: '2026-08-04 07:00', pv_red_balance: -2000 }), // period 06:45-07:00
      row({ dtimeUtc: '2026-08-04 07:15', pv_red_balance: -3000 }), // period 07:00-07:15
    ];

    const hours = processRedispatch(raw);

    const first = hours.find((h) => h.hourStartMs === Date.parse('2026-08-04T06:00:00.000Z'));
    const second = hours.find((h) => h.hourStartMs === Date.parse('2026-08-04T07:00:00.000Z'));

    // Both the 06:45- and 07:00-ending quarters belong to 06:00-07:00.
    expect(first?.pvRed).toBe(-1500);
    // Only the 07:15-ending quarter belongs to 07:00-08:00 so far.
    expect(second?.pvRed).toBe(-3000);
  });
});

describe('processRedispatch — DST and bad input', () => {
  it('keeps the two occurrences of the repeated autumn hour in separate buckets', () => {
    // "02:00" local happens twice on the autumn switch: once at UTC 00:00 and
    // once an hour later at UTC 01:00. Bucketing by a formatted local label
    // would collapse both into one hour; bucketing by UTC ms must not.
    const raw = [
      row({ dtimeUtc: '2025-10-26 00:15', pv_red_balance: -100 }),
      row({ dtimeUtc: '2025-10-26 00:30', pv_red_balance: -100 }),
      row({ dtimeUtc: '2025-10-26 00:45', pv_red_balance: -100 }),
      row({ dtimeUtc: '2025-10-26 01:00', pv_red_balance: -100 }),
      row({ dtimeUtc: '2025-10-26 01:15', pv_red_balance: -900 }),
      row({ dtimeUtc: '2025-10-26 01:30', pv_red_balance: -900 }),
      row({ dtimeUtc: '2025-10-26 01:45', pv_red_balance: -900 }),
      row({ dtimeUtc: '2025-10-26 02:00', pv_red_balance: -900 }),
    ];

    const hours = processRedispatch(raw);

    expect(hours).toHaveLength(2);
    expect(hours[0].hourStartMs).toBe(Date.parse('2025-10-26T00:00:00.000Z'));
    expect(hours[0].pvRed).toBe(-100);
    expect(hours[1].hourStartMs).toBe(Date.parse('2025-10-26T01:00:00.000Z'));
    expect(hours[1].pvRed).toBe(-900);
  });

  it('skips a row whose dtime_utc cannot be parsed rather than guessing', () => {
    const raw = [
      row({ dtimeUtc: '2026-08-04 06:15', pv_red_balance: -1000 }),
      row({ dtimeUtc: 'not a timestamp', pv_red_balance: -9999 }),
      row({ dtimeUtc: '', pv_red_balance: -9999 }),
    ];

    const hours = processRedispatch(raw);

    expect(hours).toHaveLength(1);
    expect(hours[0].pvRed).toBe(-1000);
  });

  it('returns an empty array for an empty input', () => {
    expect(processRedispatch([])).toEqual([]);
  });
});

describe('redispatchByHour', () => {
  it('keys the map by hourStartMs', () => {
    const hours = processRedispatch([
      row({ dtimeUtc: '2026-08-04 06:15', pv_red_balance: -400 }),
    ]);
    const map = redispatchByHour(hours);

    expect(map.get(Date.parse('2026-08-04T06:00:00.000Z'))).toEqual(hours[0]);
    expect(map.size).toBe(1);
  });
});

describe('hasCurtailment', () => {
  it('is false when every hour is zero or the list is empty', () => {
    expect(hasCurtailment([])).toBe(false);
    expect(
      hasCurtailment([
        { hourStartMs: 0, businessDate: '2026-08-04', pvRed: 0, windRed: 0 },
      ])
    ).toBe(false);
  });

  it('is true when any hour carries curtailment', () => {
    expect(
      hasCurtailment([
        { hourStartMs: 0, businessDate: '2026-08-04', pvRed: 0, windRed: 0 },
        { hourStartMs: 3600000, businessDate: '2026-08-04', pvRed: -50, windRed: 0 },
      ])
    ).toBe(true);
  });
});
