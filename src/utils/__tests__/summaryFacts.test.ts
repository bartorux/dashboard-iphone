import { describe, it, expect } from 'vitest';
import {
  assessmentKey,
  buildFacts,
  keyPoint,
  leadingDay,
  renderFacts,
} from '../summaryFacts';
import { visibleBusinessDates } from '../dayWindow';
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

/**
 * Past days carrying the factory's default mix, so `generationNorms` has enough
 * samples per hour to produce a median. Without history the norm map is empty
 * and no day can carry a cause at all — which is how the whole cause path once
 * went untested while every assertion stayed green.
 */
/*
 * Four WORKING days. 1 and 2 August are a Saturday and a Sunday, and the bands
 * are built per day type now — a day off is compared with days off, a working
 * day with working days — so a history leaning on the weekend leaves a working
 * day with two samples and no band at all. Production has 22; a fixture has to
 * clear the same bar.
 */
const HISTORY_WITH_MIX = [
  ...dayOf('2026-08-03', 5000),
  ...dayOf('2026-08-04', 5000),
  ...dayOf('2026-08-05', 5000),
  ...dayOf('2026-08-06', 5000),
];

/**
 * A day whose 20:00 is both its lowest hour and short of wind against that norm,
 * so the hour the facts name is the hour the cause is computed for.
 */
function windlessDay(businessDate: string, reserve: number, evening = reserve - 500) {
  return dayOf(businessDate, reserve).map((point) =>
    point.hourLabel === '20:00'
      ? { ...point, reserve: evening, wind: 400 }
      : point
  );
}

describe('buildFacts', () => {
  it('describes exactly the days the tabs offer, in order', () => {
    // This used to assert a count of three, and stood as proof that the summary
    // window did not follow the day strip. It follows it now — deliberately —
    // so the assertion became the one that matters: same days, no others. A
    // count would not catch the failure that actually threatens this, which is
    // the summary discussing a Saturday the tabs step over.
    const data = [
      ...dayOf('2026-08-10', 5000),
      ...dayOf('2026-08-11', 5000),
      ...dayOf('2026-08-12', 5000),
      ...dayOf('2026-08-13', 5000),
    ];
    const facts = buildFacts(data, [], BEFORE_ALL);
    const offered = visibleBusinessDates(BEFORE_ALL);

    expect(facts.map((day) => day.businessDate)).toEqual(
      ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'].filter((d) =>
        offered.includes(d)
      )
    );
    facts.forEach((day) => expect(offered).toContain(day.businessDate));
  });

  it('leaves out a day the tabs do not offer', () => {
    // A weekend inside the fetched window: present in the data, absent from the
    // strip, and therefore absent here. Reaching it would mean the summary
    // pointing at a chart nobody can open.
    const data = [...dayOf('2026-08-15', 5000), ...dayOf('2026-08-17', 5000)];
    const facts = buildFacts(data, [], BEFORE_ALL);

    // 15 August is a Saturday.
    expect(facts.map((day) => day.businessDate)).not.toContain('2026-08-15');
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

  it('judges a working day against working days, not against the weekend', () => {
    /*
     * The band used to be built from all thirty days at once, grouped by hour of
     * day alone. Here the weekend sits far above the working days, so a mixed
     * band swallows the subject whole and calls it ordinary.
     *
     * 9 August is a Sunday, 1, 2 and 8 August are the weekend; 3 to 6 are
     * working days.
     */
    const history = [
      ...['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'].map((date) =>
        hourOn(date, 19, { reserve: 5000, required: 2000 })
      ),
      ...['2026-08-01', '2026-08-02', '2026-08-08'].map((date) =>
        hourOn(date, 19, { reserve: 11000, required: 2000 })
      ),
    ];

    const roboczy = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 5200, required: 2000 })],
      history,
      BEFORE_ALL
    );

    // 3200 against a working-day band sitting flat at 3000 — above it. Against
    // the mixed band, which the weekend stretches to 9000, it would vanish into
    // the middle and read as entirely typical.
    expect(roboczy[0].workingDay).toBe(true);
    expect(roboczy[0].aboveTypical).toBe(1);

    const wolny = buildFacts(
      [hourOn('2026-08-09', 19, { reserve: 11200, required: 2000 })],
      history,
      BEFORE_ALL
    );

    // And the reverse: a Sunday is measured against Sundays, so 9200 stands out
    // where the mixed band would have called it ordinary too.
    expect(wolny[0].workingDay).toBe(false);
    expect(wolny[0].aboveTypical).toBe(1);
  });

  it('does not let the quiet weekend make ordinary weekday demand look high', () => {
    /*
     * The consequence that reached the card. Weekend mornings draw far less
     * power, so a norm built from all thirty days sits below any working day —
     * measured live at 08:00, 657 MW below, against a significance threshold of
     * 300. An ordinary Tuesday came out as "zapotrzebowanie powyżej normy" and
     * the card blamed demand for an hour where demand was doing nothing.
     */
    const wieczor = (date: string, demand: number, wind: number) =>
      dayOf(date, 5000).map((point) =>
        point.hourLabel === '20:00'
          ? { ...point, reserve: 4500, demand, wind }
          : { ...point, demand, wind }
      );

    // History keeps ordinary wind; only the subject is short of it, so the cause
    // line has something to name that is NOT demand.
    const history = [
      ...['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'].flatMap((d) =>
        wieczor(d, 19000, 2000)
      ),
      ...['2026-08-01', '2026-08-02', '2026-08-08'].flatMap((d) =>
        wieczor(d, 12000, 2000)
      ),
    ];

    const facts = buildFacts(
      [...wieczor('2026-08-10', 19000, 400)],
      history,
      BEFORE_ALL
    );

    // Demand exactly at the working-day norm, so it must not be named at all.
    // Against the mixed norm the weekend drags down, it lands 3500 MW "above".
    expect(facts[0].drivers).toContain('wiatr');
    expect(facts[0].drivers).not.toContain('zapotrzebowanie powyżej normy');
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

    // Named the way it should be spoken, not as an ISO date: this line is what
    // the model copies, and "śr. 2026-08-12" came back as "w środę" — fine here,
    // but the same habit turned a day six days out into a bare "w poniedziałek".
    // The ISO date still stands in the day's own header below.
    expect(point).toContain('środa');
    expect(point).not.toContain('poniedziałek');
  });

  it('falls back to the gravest day once every window has closed', () => {
    const data = [
      hourOn('2026-08-10', 18, { reserve: 800, required: 2000 }),
      hourOn('2026-08-10', 19, { reserve: 1500, required: 2000 }),
    ];
    const point = keyPoint(buildFacts(data, [], POPOLUDNIE));

    // POPOLUDNIE falls on 2026-08-10 itself, so the day is named "dziś".
    expect(point).toContain('dziś');
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

  it('says a day is unreadable rather than reassuring about it', () => {
    // The most soothing sentence in the app used to be said flatly about a day
    // carrying no readings, because ranges are built for high and moderate only
    // and a blank day leaves the same trace as a safe one.
    const data = [
      ...[10, 14, 19].map((h) =>
        hourOn('2026-08-10', h, { reserve: null, required: null })
      ),
      hourOn('2026-08-11', 19, { reserve: 5000, required: 2000 }),
    ];
    const point = keyPoint(buildFacts(data, [], BEFORE_ALL));

    expect(point).toContain('brakuje odczytów');
    // "na jutro", not "dla jutro": the day names are spoken forms now, and the
    // preposition had to change with them or the sentence stopped being Polish.
    expect(point).toContain('na jutro brakuje odczytów');
    expect(point).not.toContain('w żadnym z dni nie ma podstaw');
  });

  it('copes with no data at all', () => {
    expect(buildFacts([], [], BEFORE_ALL)).toEqual([]);
  });
});

describe('assessmentKey', () => {
  /** Same reserves throughout, so margins and band counts cannot differ. */
  const doba = (wind: number) =>
    dayOf('2026-08-10', 6000).map((point) =>
      point.hourLabel === '20:00'
        ? { ...point, reserve: 5500, wind }
        : point
    );

  it('changes when only the movement changes', () => {
    /*
     * Movement reaches the text, so it has to reach the fingerprint — otherwise
     * a forecast that started sliding while the margin held would leave the card
     * saying nothing had moved. The same gap that let a corrected cause sit
     * unpublished until the margin happened to drift.
     */
    const bez = buildFacts([...doba(2000)], HISTORY_WITH_MIX, BEFORE_ALL);
    const zRuchem = buildFacts(
      [...doba(2000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL,
      undefined,
      new Map([['2026-08-10', 'prognoza tej doby pogarsza się']])
    );

    expect(zRuchem[0].movement).toBe('prognoza tej doby pogarsza się');
    expect(bez[0].movement).toBeNull();
    expect(assessmentKey(zRuchem)).not.toBe(assessmentKey(bez));
  });

  it('ignores a cause the model never sees', () => {
    /*
     * On a moving day the cause is withheld from the facts, so a change in it
     * cannot change the text. Fingerprinting it anyway would call the model
     * again and get the same paragraph back — the exact waste this key exists to
     * prevent.
     */
    // Only the wind differs, so margins, hours and band counts stay identical
    // and the cause is the single thing that moved.
    const ruch = new Map([['2026-08-10', 'prognoza tej doby pogarsza się']]);
    const bezwietrznie = buildFacts([...doba(400)], HISTORY_WITH_MIX, BEFORE_ALL, undefined, ruch);
    const zwyczajnie = buildFacts([...doba(2000)], HISTORY_WITH_MIX, BEFORE_ALL, undefined, ruch);

    expect(bezwietrznie[0].drivers).not.toBe(zwyczajnie[0].drivers);
    expect(bezwietrznie[0].worstMargin).toBe(zwyczajnie[0].worstMargin);
    expect(assessmentKey(bezwietrznie)).toBe(assessmentKey(zwyczajnie));
  });

  it('changes when only the cause changes', () => {
    /*
     * The failure this closes. Everything else in the fingerprint describes what
     * the facts were before the cause layer existed, so a corrected or shifted
     * reason left the stored text in place — and after the 30-day audit the card
     * went on reading "zapotrzebowanie wyraźnie powyżej normy" while the facts
     * had come to say "typowe". The margin had not moved, so nothing asked for a
     * rewrite.
     */
    const zwyczajny = buildFacts([...doba(2000)], HISTORY_WITH_MIX, BEFORE_ALL);
    const bezwietrzny = buildFacts([...doba(400)], HISTORY_WITH_MIX, BEFORE_ALL);

    // The margin is untouched: only the mix differs.
    expect(bezwietrzny[0].worstMargin).toBe(zwyczajny[0].worstMargin);
    expect(bezwietrzny[0].belowTypical).toBe(zwyczajny[0].belowTypical);
    expect(bezwietrzny[0].drivers).not.toBe(zwyczajny[0].drivers);

    expect(assessmentKey(bezwietrzny)).not.toBe(assessmentKey(zwyczajny));
  });

  it('changes when only the hour\u2019s standing against the band changes', () => {
    /*
     * Harder to isolate than the cause, because the standing of the worst hour
     * usually moves together with the day's below/above counts — so the key
     * would change anyway. It does not have to: here two hours swap roles, the
     * counts stay at one below and none above, the worst hour stays the same and
     * its margin rounds to the same hundred. Only the standing of that hour
     * differs, and the sentence in the facts differs with it.
     */
    const dzien = (o19: number, o20: number) => [
      hourOn('2026-08-10', 19, { reserve: o19, required: 2000 }),
      hourOn('2026-08-10', 20, { reserve: o20, required: 2000 }),
    ];
    // History: 19:00 usually sits at a margin of 1000, 20:00 at 5000.
    const historia = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06']
      .flatMap((d) => [
        hourOn(d, 19, { reserve: 3000, required: 2000 }),
        hourOn(d, 20, { reserve: 7000, required: 2000 }),
      ]);

    // 19:00 below its own band, 20:00 ordinary.
    const a = buildFacts(dzien(2950, 7000), historia, BEFORE_ALL);
    // 19:00 ordinary, 20:00 below its own — same counts, same worst hour.
    const b = buildFacts(dzien(3000, 6950), historia, BEFORE_ALL);

    expect(a[0].worstHour).toBe(b[0].worstHour);
    expect(a[0].belowTypical).toBe(b[0].belowTypical);
    expect(a[0].aboveTypical).toBe(b[0].aboveTypical);
    expect(Math.round(a[0].worstMargin! / 100)).toBe(
      Math.round(b[0].worstMargin! / 100)
    );
    expect(a[0].worstStanding).not.toBe(b[0].worstStanding);

    expect(assessmentKey(a)).not.toBe(assessmentKey(b));
  });

  it('stays still when nothing at all has changed', () => {
    // The other half of the contract: the model is called only when there is
    // something new to say, so an unchanged forecast must give an equal key.
    const a = buildFacts([...doba(2000)], HISTORY_WITH_MIX, BEFORE_ALL);
    const b = buildFacts([...doba(2000)], HISTORY_WITH_MIX, BEFORE_ALL);

    expect(assessmentKey(a)).toBe(assessmentKey(b));
  });
});

describe('leadingDay', () => {
  it('prefers grounds over a merely tight day', () => {
    const facts = buildFacts(
      [...dayOf('2026-08-10', 2100), ...dayOf('2026-08-11', 800)],
      [],
      BEFORE_ALL
    );

    expect(leadingDay(facts)?.businessDate).toBe('2026-08-11');
  });

  it.each([
    ['grounds on the later day', 2100, 800],
    ['grounds on the earlier day', 800, 2100],
    ['a narrow margin on one of them', 8000, 2100],
    ['nothing at all', 8000, 7000],
  ])(
    'never picks a different day than the headline does: %s',
    (_label, first, second) => {
      // The cause line hangs off leadingDay while the headline comes from
      // keyPoint. If the two ever disagree, the card explains one day while
      // leading with another — which no reader would be able to make sense of.
      const facts = buildFacts(
        [...dayOf('2026-08-10', first), ...dayOf('2026-08-11', second)],
        [],
        BEFORE_ALL
      );

      const naglowek = keyPoint(facts);
      const wskazany = leadingDay(facts)?.businessDate;

      if (naglowek.includes('2026-08-10') || naglowek.includes('2026-08-11')) {
        expect(naglowek).toContain(wskazany);
      }
    }
  );

  it('falls back to the tightest day when nothing is happening', () => {
    const facts = buildFacts(
      [
        ...dayOf('2026-08-10', 8000),
        ...dayOf('2026-08-11', 6000),
        ...dayOf('2026-08-12', 9000),
      ],
      [],
      BEFORE_ALL
    );

    expect(leadingDay(facts)?.businessDate).toBe('2026-08-11');
  });

  it('has nothing to lead with when there are no readings', () => {
    expect(leadingDay([])).toBeNull();
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

  it('names one hour on a calm week, not one per day', () => {
    // Every day used to carry "najniższy margines … o HH:MM", quiet days
    // included. Harmless at three days; at five it handed the model five hours
    // and the DALEJ line came back as a list of four, each copied from these
    // lines.
    //
    // The rule is no longer "only days that have a hard hour" — the leading day
    // keeps its hour even on a calm week, because on such a week it is the only
    // concrete thing there is to say. What must not come back is the LIST, so
    // that is what this measures: five comfortable days, one hour between them.
    const spokojnyTydzien = buildFacts(
      [
        ...dayOf('2026-08-10', 8000),
        ...dayOf('2026-08-11', 8000),
        ...dayOf('2026-08-12', 8000),
        ...dayOf('2026-08-13', 7000),
        ...dayOf('2026-08-14', 8000),
      ],
      [],
      BEFORE_ALL
    );
    const tekst = renderFacts(spokojnyTydzien, 30);
    const godziny = tekst.match(/ o \d\d:00/g) ?? [];

    expect(godziny).toHaveLength(1);

    // And it belongs to the tightest day, not merely to the first one — a
    // single hour attached to the wrong day would pass the count above.
    const blok = tekst.split(/^(?=\d{4}-\d{2}-\d{2} \()/m);
    const czwartek = blok.find((part) => part.startsWith('2026-08-13'));
    expect(czwartek).toMatch(/ o \d\d:00/);

    // A narrow but positive margin is worth pointing at, and keeps its hour.
    const waski = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 2100, required: 2000 })],
      [],
      BEFORE_ALL
    );
    expect(renderFacts(waski, 30)).toContain('o 19:00');

    // So are grounds for a call period.
    const podstawy = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 800, required: 2000 })],
      [],
      BEFORE_ALL
    );
    expect(renderFacts(podstawy, 30)).toContain('o 19:00');
  });

  it('explains one day, however many could be explained', () => {
    // Every day here is short of wind in the evening, so every one of them COULD
    // carry a cause. Five causes is the list all over again, in a new slot.
    const data = [
      ...windlessDay('2026-08-10', 8000),
      ...windlessDay('2026-08-11', 8000),
      ...windlessDay('2026-08-12', 6000),
      ...windlessDay('2026-08-13', 8000),
      ...windlessDay('2026-08-14', 8000),
    ];

    const tekst = renderFacts(
      buildFacts(data, HISTORY_WITH_MIX, BEFORE_ALL),
      30
    );

    expect(tekst.match(/dlaczego akurat ta godzina/g)).toHaveLength(1);
    // On the tightest day, which is the one the headline is about.
    const blok = tekst.split(/^(?=\d{4}-\d{2}-\d{2} \()/m);
    expect(blok.find((part) => part.startsWith('2026-08-12'))).toContain(
      'wiatr poniżej normy'
    );
  });

  it('says how the named hour compares with the same hour before', () => {
    /*
     * History where 20:00 sits far above the rest of the day, so the standing
     * can only come out right if it is read for the hour being discussed. With a
     * flat history every hour shares one band and looking up the wrong one would
     * give the same answer — which is how this went untested at first.
     */
    const history = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06']
      .flatMap((date) => dayOf(date, 5000))
      .map((point) =>
        point.hourLabel === '20:00' ? { ...point, reserve: 9000 } : point
      );

    const tekst = renderFacts(
      buildFacts([...windlessDay('2026-08-10', 6000)], history, BEFORE_ALL),
      30
    );

    // Margin 3500 at 20:00 against a 7000 band for that hour — below. Against
    // the 3000 band the rest of the day carries, it would read as above.
    //
    // The hour is named in the line itself. It used to read "sama ta godzina
    // wypada w typowym zakresie dla tej godziny…" — my own word twice over,
    // copied faithfully — and the model then hung "sama ta godzina" on a
    // three-hour range it had just written, which the standing does not cover.
    expect(tekst).toContain('margines o 20:00 jest niższy niż zwykle o tej porze');
    expect(tekst).not.toContain('sama ta godzina');
  });

  it('drops the cause on a day that is moving', () => {
    /*
     * Published on v37: "Prognoza tej doby pogarsza się Z POWODU fotowoltaiki
     * poniżej normy". Untrue, and the data cannot support it — movement is a
     * drift between successive forecasts across a day and a half, the cause is a
     * level in the current one against a 30-day band for that hour. A change and
     * a level, welded by the model because both lines stood together.
     *
     * The instruction already forbids joining facts that merely sit side by
     * side. It did not hold; it never does. So the material goes instead.
     */
    const facts = buildFacts(
      [...windlessDay('2026-08-10', 6000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL,
      undefined,
      new Map([['2026-08-10', 'prognoza tej doby pogarsza się']])
    );

    // The cause is still computed — it just does not reach the model.
    expect(facts[0].drivers).not.toBeNull();

    const tekst = renderFacts(facts, 30);
    expect(tekst).toContain('prognoza tej doby pogarsza się');
    expect(tekst).not.toContain('dlaczego akurat ta godzina');
  });

  it('keeps the cause on a day that is not moving', () => {
    const facts = buildFacts(
      [...windlessDay('2026-08-10', 6000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL
    );

    expect(renderFacts(facts, 30)).toContain('dlaczego akurat ta godzina');
  });

  it('reports the slide even when the mix is unremarkable', () => {
    /*
     * The case the whole layer exists for: a day whose forecast is sliding while
     * nothing in the mix stands out. Nested inside the cause block — where this
     * line started — such a day would have said nothing about the slide at all.
     */
    const facts = buildFacts(
      [...dayOf('2026-08-10', 6000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL,
      undefined,
      new Map([['2026-08-10', 'prognoza tej doby pogarsza się']])
    );

    expect(facts[0].drivers).toContain('nic nie odstaje');
    expect(renderFacts(facts, 30)).toContain('prognoza tej doby pogarsza się');
  });

  it('writes no line when the day has not moved', () => {
    // Guarded on the value, not only on the day: without it a leading day with
    // nothing to report would print the word "null" into the facts.
    const facts = buildFacts([...dayOf('2026-08-10', 6000)], HISTORY_WITH_MIX, BEFORE_ALL);
    const tekst = renderFacts(facts, 30);

    expect(facts[0].movement).toBeNull();
    expect(tekst).not.toContain('null');
    expect(tekst).not.toContain('prognoza tej doby');
  });

  it('names the movement for the leading day and no other', () => {
    // One day, one line — the discipline the cause already follows. Several
    // days' worth would be a list, and a list is what the middle line came back
    // as every time one was offered.
    const facts = buildFacts(
      [...dayOf('2026-08-10', 8000), ...dayOf('2026-08-11', 6000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL,
      undefined,
      new Map([
        ['2026-08-10', 'prognoza tej doby poprawia się'],
        ['2026-08-11', 'prognoza tej doby pogarsza się'],
      ])
    );

    const tekst = renderFacts(facts, 30);
    const wystapienia = tekst.match(/prognoza tej doby/g) ?? [];

    expect(wystapienia).toHaveLength(1);
    // 2026-08-11 is the tighter of the two, so it leads.
    expect(tekst).toContain('prognoza tej doby pogarsza się');
  });

  it('drops the counterweight on a day the regulation ignores', () => {
    /*
     * Two reassurances against one worry is what made the published text a
     * see-saw: tightest hour of the week, but outages are low, but it is typical
     * anyway. Where nothing is at stake the standing line beneath carries the
     * "but" on its own; where there are grounds, the trade-off is the substance
     * and stays.
     */
    const spokojny = buildFacts(
      [...windlessDay('2026-08-10', 8000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL
    );
    const zPodstawami = buildFacts(
      [...windlessDay('2026-08-10', 1500, 800)],
      HISTORY_WITH_MIX,
      BEFORE_ALL
    );

    expect(spokojny[0].risk).toBe('none');
    expect(spokojny[0].drivers).not.toContain('w drugą stronę');
    expect(spokojny[0].drivers).not.toContain('zapotrzebowanie typowe');

    expect(zPodstawami[0].risk).not.toBe('none');
    expect(zPodstawami[0].drivers).toContain('zapotrzebowanie typowe');
  });

  it('says the mix is unremarkable rather than falling silent', () => {
    /*
     * Measured against each driver's own band, the mix is ordinary in about
     * three hours out of four. A cause line that only ever named culprits would
     * therefore vanish on most days and take the card back to two dry sentences
     * — the complaint this whole layer answers.
     *
     * That an hour is the tightest of the week with nothing unusual behind it is
     * itself worth saying: it means the ordinary evening peak and no more.
     */
    const zwyczajny = buildFacts(
      [...dayOf('2026-08-10', 6000)],
      HISTORY_WITH_MIX,
      BEFORE_ALL
    );

    const tekst = renderFacts(zwyczajny, 30);

    expect(tekst).toContain('dlaczego akurat ta godzina');
    expect(tekst).toContain('nic nie odstaje od normy');
  });

  it('offers no cause when history came without the mix', () => {
    // The browser fetches the narrow rows; only the summary job asks for the
    // wide ones. Without them every lookup misses and nothing is claimed.
    const data = [...windlessDay('2026-08-10', 6000)];

    expect(renderFacts(buildFacts(data, [], BEFORE_ALL), 30)).not.toContain(
      'dlaczego akurat ta godzina'
    );
  });

  it('says so plainly when there is nothing ahead', () => {
    expect(renderFacts([], 30)).toMatch(/Brak danych/);
  });
});
