import { describe, it, expect } from 'vitest';
import {
  estimateExchange,
  exchangeByDay,
  exchangeDayType,
  exchangeFromPwmRdn,
  lastEstimatesFrom,
  newEstimateLines,
  parseEstimateLog,
  withMarketResult,
} from '../saldoSzacunek';
import type { ExchangeByDay } from '../saldoSzacunek';
import type { PSEPwmRdnRawItem, PSERawItem } from '../../types';

/** A planned day: 1000 MW every hour (peak over the 700 MW threshold), with overrides. */
const plannedDay = (overrides: Record<number, number> = {}) =>
  new Map(Array.from({ length: 24 }, (_, hour) => [hour, overrides[hour] ?? 1000] as const));
const placeholderDay = () => new Map(Array.from({ length: 24 }, (_, hour) => [hour, -12] as const));

/** Mon 26.10, Tue 27.10 and Wed 28.10 planned; hour 19 at 1200, 1000 and 2000. */
const threeWorkingDays = (): ExchangeByDay =>
  new Map([
    ['2026-10-26', plannedDay({ 19: 1200 })],
    ['2026-10-27', plannedDay({ 19: 1000 })],
    ['2026-10-28', plannedDay({ 19: 2000 })],
  ]);

describe('exchangeDayType', () => {
  it('splits working days, Saturdays and Sundays-with-holidays, as the backtest did', () => {
    expect(exchangeDayType('2026-10-28')).toBe('working');
    expect(exchangeDayType('2026-10-31')).toBe('saturday');
    expect(exchangeDayType('2026-11-01')).toBe('holiday'); // Sunday and a holiday
    expect(exchangeDayType('2026-11-11')).toBe('holiday'); // Wednesday holiday
    expect(exchangeDayType('2025-11-01')).toBe('holiday'); // holiday Saturday
    expect(exchangeDayType('2026-12-24')).toBe('holiday'); // Wigilia
  });
});

describe('exchangeByDay', () => {
  const row = (period: string, planned_exchange: PSERawItem['planned_exchange'], business_date = '2026-10-28') =>
    ({ business_date, period, planned_exchange }) as PSERawItem;

  it('keys by block-start hour, leaves out the repeated autumn hour, lets later rows win', () => {
    const byDay = exchangeByDay([
      row('17 - 18', '1500.5'),
      row('03 - 03a', 999),
      row('03a - 04', 300),
      row('17 - 18', 1600),
      row('18 - 19', null),
    ]);
    expect([...byDay.get('2026-10-28')!]).toEqual([
      [17, 1600],
      [3, 300],
    ]);
  });
});

describe('estimateExchange', () => {
  it('one day past the plan: half the last planned day, half the four-week mean of that type (E5)', () => {
    const [day] = estimateExchange(threeWorkingDays(), ['2026-10-29']);
    expect(day).toMatchObject({ businessDate: '2026-10-29', basedOn: '2026-10-28', h: 1, method: 'e5' });
    // Profile (1200 + 1000 + 2000) / 3 = 1400, E5 = (2000 + 1400) / 2 = 1700.
    // Band for h=1 at 19:00 is [−1501, +1421] → 199 and 3121, to 100 MW.
    expect(day.hours.find((hour) => hour.hour === 19)).toEqual({ hour: 19, mw: 1700, p10: 200, p90: 3100 });
    expect(day.hours).toHaveLength(24);
  });

  it('three or more days past the plan: the profile alone, with the wider band', () => {
    const [day] = estimateExchange(threeWorkingDays(), ['2026-11-02']);
    expect(day).toMatchObject({ h: 5, method: 'profile' });
    // Band for h≥3 at 19:00 is [−1674, +1715].
    expect(day.hours.find((hour) => hour.hour === 19)).toEqual({ hour: 19, mw: 1400, p10: -300, p90: 3100 });
  });

  it('averages only days of the target type — a Saturday gets nothing from weekdays', () => {
    expect(estimateExchange(threeWorkingDays(), ['2026-10-31'])).toEqual([]);
  });

  it('leaves placeholder days out of the profile and out of "last planned day"', () => {
    const byDay = threeWorkingDays();
    byDay.set('2026-10-23', placeholderDay());
    byDay.set('2026-10-29', placeholderDay());
    const [day] = estimateExchange(byDay, ['2026-10-30']);
    expect(day).toMatchObject({ basedOn: '2026-10-28', h: 2, method: 'e5' });
    expect(day.hours.find((hour) => hour.hour === 19)!.mw).toBe(1700);
  });

  it('gives no estimate from fewer than three days of the type, nor for a day already planned', () => {
    const two: ExchangeByDay = new Map([
      ['2026-10-27', plannedDay()],
      ['2026-10-28', plannedDay()],
    ]);
    expect(estimateExchange(two, ['2026-10-29'])).toEqual([]);
    expect(estimateExchange(threeWorkingDays(), ['2026-10-28'])).toEqual([]);
  });

  it('skips one hour the last planned day lacks, keeps the rest', () => {
    const byDay = threeWorkingDays();
    byDay.get('2026-10-28')!.delete(5);
    const [day] = estimateExchange(byDay, ['2026-10-29']);
    expect(day.hours.map((hour) => hour.hour)).not.toContain(5);
    expect(day.hours).toHaveLength(23);
  });
});

describe('exchangeFromPwmRdn', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  /** 96 quarters of 29.10: 300 MW in from CZ, 100 out to SK, UA closed. */
  const quarters = (override: (index: number) => Partial<PSEPwmRdnRawItem> = () => ({})): PSEPwmRdnRawItem[] =>
    Array.from({ length: 96 }, (_, index) => {
      const end = (index + 1) * 15;
      const dtime =
        end === 24 * 60 ? '2026-10-30 00:00:00' : `2026-10-29 ${pad(Math.floor(end / 60))}:${pad(end % 60)}:00`;
      return {
        business_date: '2026-10-29',
        dtime,
        cz_pl: 300, de_pl: 0, lt_pl: 0, se_pl: 0, sk_pl: 0,
        pl_cz: 0, pl_de: 0, pl_lt: 0, pl_se: 0, pl_sk: -100,
        ua_pl: null, ua_dob_pl: null, pl_ua: null, pl_ua_dob: null,
        ...override(index),
      };
    });

  it('sums every border, averages the quarters, puts the 23:45 quarter (ending 00:00 next day) in hour 23', () => {
    const hourly = exchangeFromPwmRdn(quarters((index) => (index >= 76 && index < 80 ? { de_pl: index - 75 } : {})), '2026-10-29');
    expect(hourly).not.toBeNull();
    expect(hourly!.size).toBe(24);
    expect(hourly!.get(0)).toBe(200);
    expect(hourly!.get(23)).toBe(200);
    expect(hourly!.get(19)).toBe(203); // 200 + mean(1, 2, 3, 4), rounded
  });

  it('is null while any synchronous border is still empty — the state of D+2, with UA alone filled', () => {
    expect(exchangeFromPwmRdn(quarters((index) => (index === 50 ? { de_pl: null } : {})), '2026-10-29')).toBeNull();
    expect(exchangeFromPwmRdn(quarters().slice(0, 91), '2026-10-29')).toBeNull();
  });

  it('counts UA where it is filled', () => {
    expect(exchangeFromPwmRdn(quarters(() => ({ ua_pl: 50 })), '2026-10-29')!.get(10)).toBe(250);
  });

  it('leaves out the repeated autumn hour, whose quarters carry an "a"', () => {
    const fold: PSEPwmRdnRawItem[] = ['02a:15:00', '02a:30:00', '02a:45:00', '03a:00:00'].map((time) => ({
      ...quarters()[0],
      dtime: `2026-10-29 ${time}`,
      cz_pl: 9999,
    }));
    expect(exchangeFromPwmRdn([...quarters(), ...fold], '2026-10-29')!.get(2)).toBe(200);
  });
});

describe('withMarketResult', () => {
  it('swaps one day for the market result and keeps its base and horizon', () => {
    const estimates = estimateExchange(threeWorkingDays(), ['2026-10-29', '2026-11-02']);
    const swapped = withMarketResult(estimates, '2026-10-29', new Map([[19, 2310], [7, 900]]));
    expect(swapped[0]).toEqual({
      businessDate: '2026-10-29',
      basedOn: '2026-10-28',
      h: 1,
      method: 'pwm-rdn',
      hours: [
        { hour: 7, mw: 900, p10: null, p90: null },
        { hour: 19, mw: 2310, p10: null, p90: null },
      ],
    });
    expect(swapped[1]).toBe(estimates[1]);
  });
});

describe('estimate log', () => {
  const NOW = '2026-10-28T12:00:00.000Z';
  const LATER = '2026-10-28T12:15:00.000Z';

  it('writes [businessDate, hour, h, method, mw, p10, p90, readAt] and parses it back', () => {
    const lines = newEstimateLines(estimateExchange(threeWorkingDays(), ['2026-10-29']), new Map(), NOW);
    expect(lines).toHaveLength(24);
    expect(JSON.parse(lines[19])).toEqual(['2026-10-29', 19, 1, 'e5', 1700, 200, 3100, NOW]);
    expect(parseEstimateLog(lines.join('\n'))[19]).toEqual(JSON.parse(lines[19]));
  });

  it('writes again only the hours whose horizon, method or figures moved', () => {
    const estimates = estimateExchange(threeWorkingDays(), ['2026-10-29']);
    const last = lastEstimatesFrom([newEstimateLines(estimates, new Map(), NOW).join('\n')]);
    expect(newEstimateLines(estimates, last, LATER)).toEqual([]);

    const market = withMarketResult(estimates, '2026-10-29', new Map([[19, 1700]]));
    expect(newEstimateLines(market, last, LATER).map((line) => JSON.parse(line))).toEqual([
      ['2026-10-29', 19, 1, 'pwm-rdn', 1700, null, null, LATER],
    ]);
  });

  it('writes a line when only the method changes', () => {
    const [day] = estimateExchange(threeWorkingDays(), ['2026-10-29']);
    const last = lastEstimatesFrom([newEstimateLines([day], new Map(), NOW).join('\n')]);
    expect(newEstimateLines([{ ...day, method: 'profile' }], last, LATER)).toHaveLength(24);
  });

  it('lets the later partition win, skips broken lines and dates far from the run', () => {
    const september = JSON.stringify(['2026-10-29', 19, 2, 'e5', 1500, 0, 3000, NOW]);
    const october = JSON.stringify(['2026-10-29', 19, 1, 'e5', 1700, 400, 3100, LATER]);
    expect(lastEstimatesFrom([september, `{broken\n${october}`]).get('2026-10-29#19')).toEqual([1, 'e5', 1700, 400, 3100]);
    expect(parseEstimateLog('["2026-10-29",19,1,"guess",1,null,null,"x"]')).toEqual([]);

    const far = estimateExchange(threeWorkingDays(), ['2026-10-29']).map((day) => ({ ...day, businessDate: '2031-10-29' }));
    expect(newEstimateLines(far, new Map(), NOW)).toEqual([]);
  });
});
