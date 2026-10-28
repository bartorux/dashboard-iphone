import { describe, it, expect } from 'vitest';
import { newOzeArchiveLines, ozeLastValuesFrom, parseOzeArchiveLines } from '../ozeArchive';
import type { PSERawItem } from '../../types';
import fixtureAutumn from '../__fixtures__/pse-dst-autumn.json';

const row = (overrides: Partial<PSERawItem> = {}): PSERawItem => ({
  req_pow_res: 1964,
  business_date: '2026-10-30',
  period: '18 - 19',
  plan_dtime: '2026-10-30 19:00:00',
  plan_dtime_utc: '2026-10-30 18:00:00',
  fcst_pv_tot_gen: 0,
  fcst_wi_tot_gen: 3120,
  grid_demand_fcst: 21450,
  ...overrides,
}) as PSERawItem;
const NOW = '2026-10-28T12:00:00.000Z';

describe('newOzeArchiveLines', () => {
  it('writes [businessDate, start hour, PV, wind, demand, readAt] — the hour from the period, never plan_dtime', () => {
    const [line] = newOzeArchiveLines([row()], new Map(), NOW);
    expect(JSON.parse(line)).toEqual(['2026-10-30', 18, 0, 3120, 21450, NOW]);
  });

  it('writes nothing again for unchanged values, a line once one of the three moves', () => {
    const first = newOzeArchiveLines([row()], new Map(), NOW);
    const last = parseOzeArchiveLines(first.join('\n'));
    expect(newOzeArchiveLines([row()], last, '2026-10-28T12:15:00.000Z')).toEqual([]);
    expect(newOzeArchiveLines([row({ fcst_wi_tot_gen: 2980 })], last, '2026-10-28T12:15:00.000Z')).toHaveLength(1);
  });

  it('dedupes two rows of one batch for the same block against each other', () => {
    expect(newOzeArchiveLines([row(), row()], new Map(), NOW)).toHaveLength(1);
  });

  it('skips a row with none of the three, and a business date far from the run', () => {
    const empty = row({ fcst_pv_tot_gen: null, fcst_wi_tot_gen: null, grid_demand_fcst: null });
    expect(newOzeArchiveLines([empty, row({ business_date: '2031-10-30' })], new Map(), NOW)).toEqual([]);
  });

  it('keeps one line per wall-clock hour on the 25-hour day, as the pk5l archive does', () => {
    const rows = ((fixtureAutumn as { value?: PSERawItem[] }).value ?? (fixtureAutumn as unknown as PSERawItem[]));
    const hours = newOzeArchiveLines(rows, new Map(), '2025-10-26T12:00:00.000Z')
      .map((line) => JSON.parse(line))
      .filter((parsed) => parsed[0] === '2025-10-26')
      .map((parsed) => parsed[1]);
    expect(hours).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
  });
});

describe('ozeLastValuesFrom', () => {
  it('lets the later partition win, so the first run of a month does not re-archive an unchanged value', () => {
    const september = newOzeArchiveLines([row({ fcst_wi_tot_gen: 1000 })], new Map(), NOW).join('\n');
    const october = newOzeArchiveLines([row()], new Map(), NOW).join('\n');
    const last = ozeLastValuesFrom([september, october]);
    expect(newOzeArchiveLines([row()], last, NOW)).toEqual([]);
  });

  it('skips a broken line without losing the others', () => {
    const good = newOzeArchiveLines([row()], new Map(), NOW)[0];
    expect(parseOzeArchiveLines(`{"broken"\n${good}`).size).toBe(1);
  });
});
