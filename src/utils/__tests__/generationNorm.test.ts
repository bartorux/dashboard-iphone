import { describe, it, expect } from 'vitest';
import {
  describeDrivers,
  explainHour,
  generationNorms,
  type HourNorm,
} from '../generationNorm';
import { makePoint } from '../../test/factories';

const at20 = (overrides: Partial<Parameters<typeof makePoint>[0]> = {}) =>
  makePoint({ hourLabel: '20:00', ...overrides });

/** A norm for 20:00 shaped like the real August medians. */
const norm: HourNorm = {
  hourLabel: '20:00',
  medians: {
    wiatr: 1448,
    PV: 427,
    zapotrzebowanie: 19078,
    ubytki: 2272,
  },
  samples: 30,
};

describe('generationNorms', () => {
  it('takes the median per hour, not the mean', () => {
    // One windy day must not make an ordinary evening look calm.
    const history = [
      at20({ wind: 1000 }),
      at20({ wind: 1100 }),
      at20({ wind: 9000 }),
    ];

    expect(generationNorms(history).get('20:00')?.medians.wiatr).toBe(1100);
  });

  it('keeps hours apart', () => {
    const history = [
      at20({ wind: 1000 }),
      at20({ wind: 1000 }),
      at20({ wind: 1000 }),
      makePoint({ hourLabel: '03:00', wind: 4000 }),
      makePoint({ hourLabel: '03:00', wind: 4000 }),
      makePoint({ hourLabel: '03:00', wind: 4000 }),
    ];

    const norms = generationNorms(history);

    expect(norms.get('20:00')?.medians.wiatr).toBe(1000);
    expect(norms.get('03:00')?.medians.wiatr).toBe(4000);
  });

  it('refuses an hour with too few readings', () => {
    const history = [at20({ wind: 1000 }), at20({ wind: 1100 })];

    expect(generationNorms(history).has('20:00')).toBe(false);
  });

  it('leaves a driver null when its own readings are too few', () => {
    const history = [
      at20({ wind: 1000, pv: null }),
      at20({ wind: 1100, pv: null }),
      at20({ wind: 1200, pv: 500 }),
    ];

    const medians = generationNorms(history).get('20:00')?.medians;

    expect(medians?.wiatr).toBe(1100);
    expect(medians?.PV).toBeNull();
  });
});

describe('explainHour', () => {
  it('names what makes the margin worse', () => {
    const point = at20({ wind: 400, pv: 427, demand: 19078, outages: 2272 });

    const drivers = explainHour(point, norm).worse;

    expect(drivers.map((driver) => driver.name)).toEqual(['wiatr']);
    expect(drivers[0].delta).toBe(-1048);
    expect(drivers[0].impact).toBe(1048);
  });

  it('stays silent about a driver that is helping', () => {
    // An unusually windy evening is not why an hour is tight, and saying "wind
    // above normal" next to a narrow margin reads as the cause.
    const point = at20({ wind: 4000, pv: 427, demand: 19078, outages: 2272 });

    expect(explainHour(point, norm).worse).toEqual([]);
  });

  it('reads demand and outages the other way round from wind', () => {
    const point = at20({ wind: 1448, pv: 427, demand: 21000, outages: 4000 });

    const names = explainHour(point, norm).worse.map((driver) => driver.name);

    expect(names).toEqual(['zapotrzebowanie', 'ubytki']);
  });

  it('keeps only the two worst', () => {
    const point = at20({ wind: 200, pv: 0, demand: 21000, outages: 4000 });

    const drivers = explainHour(point, norm).worse;

    // All four are off: demand by 1922, outages by 1728, wind by 1248, PV by
    // 427. Only the two heaviest survive, and wind — the obvious culprit to a
    // reader — is not among them.
    expect(drivers).toHaveLength(2);
    expect(drivers.map((driver) => driver.name)).toEqual([
      'zapotrzebowanie',
      'ubytki',
    ]);
  });

  it('ignores a difference too small to have made the hour tight', () => {
    const point = at20({ wind: 1200, pv: 427, demand: 19078, outages: 2272 });

    expect(explainHour(point, norm).worse).toEqual([]);
  });

  it('marks ordinary demand as ordinary', () => {
    const point = at20({ wind: 400, pv: 427, demand: 19078, outages: 2272 });

    expect(explainHour(point, norm).demandTypical).toBe(true);
  });

  it('does not mark demand ordinary when it is the problem', () => {
    const point = at20({ wind: 1448, pv: 427, demand: 21000, outages: 2272 });

    expect(explainHour(point, norm).demandTypical).toBe(false);
  });

  it('reports no helper when nothing is working against it', () => {
    // Checked on the structure, not through describeDrivers: that returns null
    // for an empty `worse` either way, so it cannot tell the two apart.
    const point = at20({ wind: 1448, pv: 427, demand: 19078, outages: 800 });

    const explanation = explainHour(point, norm);

    expect(explanation.worse).toEqual([]);
    expect(explanation.better).toBeNull();
  });

  it('says nothing without a norm for the hour', () => {
    const point = at20({ wind: 0 });

    expect(explainHour(point, undefined)).toEqual({
      worse: [],
      better: null,
      demandTypical: false,
    });
  });

  it('skips a driver the forecast did not carry', () => {
    const point = at20({ wind: null, pv: 427, demand: 19078, outages: 4000 });

    expect(explainHour(point, norm).worse.map((d) => d.name)).toEqual([
      'ubytki',
    ]);
  });
});

describe('describeDrivers', () => {
  it('writes the clause measured on 12 August', () => {
    const point = at20({ wind: 653, pv: 16, demand: 19063, outages: 2995 });

    expect(describeDrivers(explainHour(point, norm))).toBe(
      'wiatr poniżej normy, ubytki powyżej normy, zapotrzebowanie typowe'
    );
  });

  it('reaches for a stronger word only past the exemption-sized gap', () => {
    const near = at20({ wind: 500, pv: 427, demand: 19078, outages: 2272 });
    const far = at20({ wind: 400, pv: 427, demand: 19078, outages: 2272 });

    expect(describeDrivers(explainHour(near, norm))).toBe(
      'wiatr poniżej normy, zapotrzebowanie typowe'
    );
    expect(describeDrivers(explainHour(far, norm))).toBe(
      'wiatr wyraźnie poniżej normy, zapotrzebowanie typowe'
    );
  });

  it('returns nothing rather than a line saying everything is normal', () => {
    const point = at20({ wind: 1448, pv: 427, demand: 19078, outages: 2272 });

    expect(describeDrivers(explainHour(point, norm))).toBeNull();
  });

  it('names what is holding the margin up, measured on 13 August', () => {
    // The week's tightest hour, and comfortable anyway: wind 766 MW short of
    // usual, outages 845 MW below theirs. Reporting only the first would
    // describe an evening to worry about.
    const point = at20({ wind: 682, pv: 201, demand: 18964, outages: 1427 });

    expect(describeDrivers(explainHour(point, norm))).toBe(
      'wiatr poniżej normy, zapotrzebowanie typowe; w drugą stronę ubytki poniżej normy'
    );
  });

  it('stays quiet about help when nothing is working against it', () => {
    // Explaining why a comfortable hour is comfortable is filler.
    const point = at20({ wind: 1448, pv: 427, demand: 19078, outages: 1000 });

    expect(describeDrivers(explainHour(point, norm))).toBeNull();
  });

  it('names one helper at most', () => {
    const point = at20({ wind: 200, pv: 427, demand: 17000, outages: 800 });

    const clause = describeDrivers(explainHour(point, norm)) ?? '';

    expect(clause.match(/w drugą stronę/g)).toHaveLength(1);
    expect(clause).toContain('w drugą stronę zapotrzebowanie');
    expect(clause).not.toContain('ubytki');
  });

  it('omits the demand clause when demand is itself unusual', () => {
    // 522 MW above the usual — enough to name, not enough for "wyraźnie".
    const point = at20({ wind: 1448, pv: 427, demand: 19600, outages: 2272 });

    expect(describeDrivers(explainHour(point, norm))).toBe(
      'zapotrzebowanie powyżej normy'
    );
  });
});
