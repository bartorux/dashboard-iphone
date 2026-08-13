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

/**
 * A norm for 20:00 shaped like the real August bands, measured over 22 working
 * days. The spreads differ by an order of magnitude on purpose: demand moves
 * within 7% of its median, wind within 134% of its own. That gap is why a fixed
 * megawatt threshold could not serve both.
 */
const norm: HourNorm = {
  hourLabel: '20:00',
  bands: {
    wiatr: { p10: 475, p50: 1448, p90: 2548 },
    PV: { p10: 204, p50: 427, p90: 616 },
    zapotrzebowanie: { p10: 18785, p50: 19078, p90: 20046 },
    ubytki: { p10: 1184, p50: 2272, p90: 3807 },
  },
  samples: 22,
};

describe('generationNorms', () => {
  it('takes the median per hour, not the mean', () => {
    // One windy day must not make an ordinary evening look calm.
    const history = [
      at20({ wind: 1000 }),
      at20({ wind: 1100 }),
      at20({ wind: 9000 }),
    ];

    expect(generationNorms(history).get('20:00')?.bands.wiatr?.p50).toBe(1100);
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

    expect(norms.get('20:00')?.bands.wiatr?.p50).toBe(1000);
    expect(norms.get('03:00')?.bands.wiatr?.p50).toBe(4000);
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

    const bands = generationNorms(history).get('20:00')?.bands;

    expect(bands?.wiatr?.p50).toBe(1100);
    expect(bands?.PV).toBeNull();
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
      nothingStandsOut: false,
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
  it('corrects what 12 August actually showed', () => {
    /*
     * The real figures, and the verdict they deserve. Under the old fixed
     * threshold this came out as "wiatr poniżej normy, ubytki powyżej normy" and
     * the card told a story about a windless evening.
     *
     * Wind was 653 MW against a band running 475 to 2548 — squarely ordinary for
     * that hour. Outages at 2995 sit inside 1184–3807. The one genuinely unusual
     * reading was PV at 16 against a floor of 204. The old rule named two
     * culprits, and neither was one.
     */
    const point = at20({ wind: 653, pv: 16, demand: 19063, outages: 2995 });

    expect(describeDrivers(explainHour(point, norm))).toBe(
      'PV poniżej normy; zapotrzebowanie typowe'
    );
  });

  it('grades nothing beyond in or out of the band', () => {
    // Both below the 475 floor and both said the same way. A second grade used
    // to be added past a fixed 1000 MW, which fired for every unusual demand
    // reading and for almost no unusual wind — the same scale error as the
    // threshold it came with.
    const ledwo = at20({ wind: 470, pv: 427, demand: 19078, outages: 2272 });
    const daleko = at20({ wind: 100, pv: 427, demand: 19078, outages: 2272 });

    expect(describeDrivers(explainHour(ledwo, norm))).toBe(
      'wiatr poniżej normy; zapotrzebowanie typowe'
    );
    expect(describeDrivers(explainHour(daleko, norm))).toBe(
      'wiatr poniżej normy; zapotrzebowanie typowe'
    );
  });

  it('says so plainly when nothing stands out', () => {
    /*
     * Against each driver's own band the mix is unremarkable roughly three times
     * in four. A line that only ever named culprits would therefore fall silent
     * on most days and the card would go terse again — so this case gets a
     * sentence of its own, and it is a true one: the tightest hour of the week
     * with nothing unusual behind it is just the ordinary evening peak.
     */
    const point = at20({ wind: 1448, pv: 427, demand: 19078, outages: 2272 });

    expect(describeDrivers(explainHour(point, norm))).toBe(
      'nic nie odstaje od normy dla tej pory — zwykły przebieg doby'
    );
  });

  it('does not call a blank forecast "ordinary"', () => {
    /*
     * The norm exists for this hour, but the forecast carries no mix at all. That
     * is ignorance, not a finding — and "nic nie odstaje od normy" asserted over
     * four missing readings would be the most reassuring sentence in the app,
     * about an hour it had never seen.
     */
    const puste = at20({ wind: null, pv: null, demand: null, outages: null });

    const explanation = explainHour(puste, norm);

    expect(explanation.nothingStandsOut).toBe(false);
    expect(describeDrivers(explanation)).toBeNull();
  });

  it('keeps quiet when there is no norm to compare against', () => {
    // Silence for want of data is not the same finding as "nothing stands out",
    // and must not be dressed up as one.
    expect(describeDrivers(explainHour(at20({ wind: 0 }), undefined))).toBeNull();
  });

  it('names what is holding the margin up, measured on 13 August', () => {
    // The week's tightest hour, and comfortable anyway: wind 766 MW short of
    // usual, outages 845 MW below theirs. Reporting only the first would
    // describe an evening to worry about.
    // Wind below its floor of 475, outages below theirs of 1184.
    const point = at20({ wind: 470, pv: 427, demand: 18964, outages: 900 });

    // One counterweight, and the measured one wins: "demand is ordinary" is
    // dropped in favour of the outages that actually moved. Three factors in a
    // row is what the model transcribed back as a machine would.
    expect(describeDrivers(explainHour(point, norm))).toBe(
      'wiatr poniżej normy; w drugą stronę ubytki poniżej normy'
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
    // Above the 20046 ceiling, so demand is the one thing named — and it is the
    // only driver whose band is tight enough that a few hundred megawatts means
    // something.
    const point = at20({ wind: 1448, pv: 427, demand: 20200, outages: 2272 });

    expect(describeDrivers(explainHour(point, norm))).toBe(
      'zapotrzebowanie powyżej normy'
    );
  });
});
