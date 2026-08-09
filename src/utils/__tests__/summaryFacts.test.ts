import { describe, it, expect } from 'vitest';
import { buildFacts, renderFacts } from '../summaryFacts';
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
    expect(renderFacts(facts, 30)).toContain('blisko granicy');
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
    expect(text).toContain('ryzyko przywołania');
    // Sending PSE's JSON would cost far more tokens to say less.
    expect(text.length).toBeLessThan(1200);
  });

  it('says so plainly when there is nothing ahead', () => {
    expect(renderFacts([], 30)).toMatch(/Brak danych/);
  });
});
