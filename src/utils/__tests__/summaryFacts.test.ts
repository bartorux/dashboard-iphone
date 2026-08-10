import { describe, it, expect } from 'vitest';
import { buildFacts, keyPoint, renderFacts } from '../summaryFacts';
import { makePoint } from '../../test/factories';

const pad = (value: number) => String(value).padStart(2, '0');

function hourOn(
  businessDate: string,
  startHour: number,
  overrides: Partial<Parameters<typeof makePoint>[0]> = {}
) {
  return makePoint({
    businessDate,
    hourLabel: `${pad(startHour)}:00`,
    endLabel: `${pad((startHour + 1) % 24)}:00`,
    time: new Date(`${businessDate}T${pad((startHour + 1) % 24)}:00:00Z`),
    ...overrides,
  });
}

function dayOf(businessDate: string, reserve: number, required = 2000) {
  return Array.from({ length: 24 }, (_, hour) =>
    hourOn(businessDate, hour, { reserve, required })
  );
}

const BEFORE_ALL = new Date('2026-08-09T00:00:00Z');

describe('buildFacts', () => {
  it('reports the days still ahead, in order, capped', () => {
    const data = [
      ...dayOf('2026-08-10', 5000),
      ...dayOf('2026-08-11', 5000),
      ...dayOf('2026-08-12', 5000),
      ...dayOf('2026-08-13', 5000),
    ];
    const facts = buildFacts(data, [], BEFORE_ALL);

    expect(facts.map((day) => day.businessDate)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it('drops a day once nothing is left of it', () => {
    const data = [...dayOf('2026-08-10', 5000), ...dayOf('2026-08-11', 5000)];
    // Past the end of the 10th entirely.
    const facts = buildFacts(data, [], new Date('2026-08-11T00:00:00Z'));

    expect(facts.map((day) => day.businessDate)).toEqual(['2026-08-11']);
  });

  it('marks a weekend as not a working day', () => {
    const facts = buildFacts(dayOf('2026-08-09', 5000), [], BEFORE_ALL);
    expect(facts[0]).toMatchObject({ workingDay: false, weekday: 'niedz.' });
  });

  it('finds the worst hour among those still ahead', () => {
    const data = [
      hourOn('2026-08-10', 8, { reserve: 4000, required: 2000 }),
      hourOn('2026-08-10', 19, { reserve: 2100, required: 2000 }),
      hourOn('2026-08-10', 20, { reserve: 3000, required: 2000 }),
    ];
    const facts = buildFacts(data, [], BEFORE_ALL);

    expect(facts[0].worstMargin).toBe(100);
    expect(facts[0].worstHour).toBe('19:00');
  });

  it('carries the call-period verdict and its ranges', () => {
    const data = [
      hourOn('2026-08-10', 18, { reserve: 800, required: 2000 }),
      hourOn('2026-08-10', 19, { reserve: 800, required: 2000 }),
    ];
    const facts = buildFacts(data, [], BEFORE_ALL);

    expect(facts[0].risk).toBe('high');
    expect(facts[0].ranges).toHaveLength(1);
    expect(facts[0].ranges[0]).toMatchObject({ from: '18:00', to: '20:00' });
  });

  it('counts both directions against the 30-day band', () => {
    // History puts 19:00 typically around a margin of 1000.
    const history = Array.from({ length: 10 }, (_, day) =>
      hourOn(`2026-07-${pad(day + 1)}`, 19, { reserve: 3000, required: 2000 })
    );

    const low = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 2100, required: 2000 })],
      history,
      BEFORE_ALL
    );
    const high = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 9000, required: 2000 })],
      history,
      BEFORE_ALL
    );

    expect(low[0].belowTypical).toBe(1);
    expect(low[0].aboveTypical).toBe(0);
    expect(high[0].aboveTypical).toBe(1);
    expect(high[0].belowTypical).toBe(0);
  });

  it('flags a thin but positive margin, which the call-period rule alone would call fine', () => {
    // The alert panel shows an alarm for this hour while the regulation sees no
    // grounds at all — the card must be able to say "close" rather than appear
    // to contradict the panel beneath it.
    const data = [hourOn('2026-08-10', 20, { reserve: 2177, required: 2000 })];
    const facts = buildFacts(data, [], BEFORE_ALL);

    expect(facts[0].risk).toBe('none');
    expect(facts[0].nearThreshold).toBe(1);
    expect(renderFacts(facts, 30)).toContain('poza powyższym zakresem');
  });

  it('does not call an hour close when it is a day off or outside the window', () => {
    const sunday = buildFacts(
      [hourOn('2026-08-09', 20, { reserve: 2177, required: 2000 })],
      [],
      BEFORE_ALL
    );
    const night = buildFacts(
      [hourOn('2026-08-10', 3, { reserve: 2177, required: 2000 })],
      [],
      BEFORE_ALL
    );

    expect(sunday[0].nearThreshold).toBe(0);
    expect(night[0].nearThreshold).toBe(0);
  });

  it('quotes the hours of the range it names, not merely the first of the day', () => {
    // Ranges arrive chronologically. A day with a milder morning range and the
    // worst one in the evening announced the evening's verdict over the
    // morning's hours — the right label bolted to the wrong time.
    const data = [
      // Morning: deficit but surplus above the exemption — operator may refrain.
      hourOn('2026-08-10', 8, { reserve: 1500, required: 2000 }),
      hourOn('2026-08-10', 12, { reserve: 5000, required: 2000 }),
      // Evening: surplus below the exemption — grounds to refrain fall away.
      hourOn('2026-08-10', 19, { reserve: 800, required: 2000 }),
    ];
    const point = keyPoint(buildFacts(data, [], BEFORE_ALL));

    expect(point).toContain('przywołanie powinno zostać ogłoszone');
    expect(point).toContain('19:00');
    expect(point).not.toContain('08:00');
  });

  it('names an hour the sentence about narrow margins actually covers', () => {
    // `worstHour` is the lowest margin of the whole day, which here falls at
    // 03:00 — a night hour no call period can apply to, and the very sort this
    // count excludes.
    const data = [
      hourOn('2026-08-10', 3, { reserve: 2050, required: 2000 }),
      hourOn('2026-08-10', 19, { reserve: 2100, required: 2000 }),
    ];
    const point = keyPoint(buildFacts(data, [], BEFORE_ALL));

    expect(point).toContain('19:00');
    expect(point).not.toContain('03:00');
  });

  /*
   * Notice runs out eight hours before a block. Anchoring "now" at 14:00 leaves
   * the same evening settled and later days still open, which is exactly the
   * split these two tests turn on.
   */
  const POPOLUDNIE = new Date('2026-08-10T14:00:00Z');

  it('leads with a day still open, even when a graver one is already settled', () => {
    // Leading purely by severity put a Monday evening on top whose notice period
    // had lapsed — the next sentence admitted it — while a Wednesday the operator
    // could still act on waited until the last line.
    const data = [
      // Monday 18:00 is four hours off: nothing can be declared for it now.
      hourOn('2026-08-10', 18, { reserve: 800, required: 2000 }),
      // Wednesday is days away and still open, though its verdict is milder.
      hourOn('2026-08-12', 20, { reserve: 1500, required: 2000 }),
    ];
    const point = keyPoint(buildFacts(data, [], POPOLUDNIE));

    expect(point).toContain('2026-08-12');
    expect(point).not.toContain('2026-08-10');
  });

  it('falls back to the gravest day once every window has closed', () => {
    const data = [
      hourOn('2026-08-10', 18, { reserve: 800, required: 2000 }),
      hourOn('2026-08-10', 19, { reserve: 1500, required: 2000 }),
    ];
    const point = keyPoint(buildFacts(data, [], POPOLUDNIE));

    expect(point).toContain('2026-08-10');
    expect(point).toContain('przywołanie powinno zostać ogłoszone');
  });

  it('prefers the range within a day that can still be announced', () => {
    // Both carry the same verdict; only one can still be acted upon.
    const data = [
      hourOn('2026-08-11', 8, { reserve: 800, required: 2000 }),
      hourOn('2026-08-11', 12, { reserve: 5000, required: 2000 }),
      hourOn('2026-08-11', 20, { reserve: 800, required: 2000 }),
    ];
    // Late enough that the morning has lapsed but the evening has not.
    const point = keyPoint(
      buildFacts(data, [], new Date('2026-08-11T05:00:00Z'))
    );

    expect(point).toContain('20:00');
    expect(point).not.toContain('08:00');
  });

  it('copes with no data at all', () => {
    expect(buildFacts([], [], BEFORE_ALL)).toEqual([]);
  });
});

describe('renderFacts', () => {
  it('stays compact and free of the raw payload', () => {
    const data = [
      ...dayOf('2026-08-10', 800),
      ...dayOf('2026-08-11', 5000),
    ];
    const text = renderFacts(buildFacts(data, [], BEFORE_ALL), 30);

    expect(text).toContain('2026-08-10');
    expect(text).toContain('stan:');
    // Names the state the regulation provides for, not a level of alarm of ours.
    expect(text).toContain('PRZYWOŁANIE POWINNO ZOSTAĆ OGŁOSZONE');
    // "Refrain from declaring", not "withdraw from": the second presupposes a
    // declaration already hanging over the reader, which is not what is meant.
    expect(text).not.toContain('ODSTĄPIĆ');
    // Sending PSE's JSON would cost far more tokens to say less.
    expect(text.length).toBeLessThan(1200);
  });

  it('says so plainly when there is nothing ahead', () => {
    expect(renderFacts([], 30)).toMatch(/Brak danych/);
  });
});
