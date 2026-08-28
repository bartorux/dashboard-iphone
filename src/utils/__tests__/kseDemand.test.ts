import { describe, it, expect } from 'vitest';
import { processKseDemand } from '../kseDemand';

const H12 = Date.UTC(2026, 7, 28, 12);
const q = (min: string, dem: number) => ({
  business_date: '2026-08-28',
  dtime_utc: `2026-08-28 12:${min}:00`,
  kse_pow_dem: dem,
});

describe('processKseDemand', () => {
  it('averages the quarters of an hour, end-stamped like every PSE series', () => {
    // dtime_utc stamps the END of each quarter, so 12:15/12:30/12:45/13:00
    // are all hour 12 — including the 13:00 boundary quarter, which a naive
    // floor would misfile into hour 13 (the same trap redispatch hit).
    const rows = [
      q('15', 19800),
      q('30', 19900),
      q('45', 20000),
      { business_date: '2026-08-28', dtime_utc: '2026-08-28 13:00:00', kse_pow_dem: 20100 },
    ];
    const hours = processKseDemand(rows);
    expect(hours.get(H12)).toBe(19950);
    expect(hours.has(Date.UTC(2026, 7, 28, 13))).toBe(false);
  });

  it('averages only the quarters actually present', () => {
    const hours = processKseDemand([q('15', 20000), q('30', 21000)]);
    expect(hours.get(H12)).toBe(20500);
  });

  it('skips unparsable rows and non-numeric demand', () => {
    const hours = processKseDemand([
      { business_date: '2026-08-28', dtime_utc: 'zepsute', kse_pow_dem: 20000 },
      q('15', Number.NaN),
      q('30', 20000),
    ]);
    expect(hours.get(H12)).toBe(20000);
  });

  it('returns an empty map for an unpublished day', () => {
    expect(processKseDemand([]).size).toBe(0);
  });
});
