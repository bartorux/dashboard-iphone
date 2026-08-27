import { describe, it, expect } from 'vitest';
import { PSECompassRawItem } from '../../types';
import { COMPASS_WORD, compassRanges, parseCompass } from '../compass';

/**
 * Rows shaped exactly as the live endpoint serves them, verified against a
 * response fetched 2026-08-27: `dtime` is the LOCAL start of the block and runs
 * 00:00 through 23:00 for a business day, `dtime_utc` is the same instant
 * WITHOUT seconds. Poland keeps UTC+2 in August, so the two differ by two hours.
 */
const pad = (value: number) => String(value).padStart(2, '0');

function row(
  localHour: number,
  usage: number | string,
  overrides: Partial<PSECompassRawItem> = {}
): PSECompassRawItem {
  const utcHour = localHour - 2;
  return {
    business_date: '2026-08-27',
    dtime: `2026-08-27 ${pad(localHour)}:00`,
    dtime_utc: `2026-08-27 ${pad(utcHour)}:00`,
    usage_fcst: usage,
    is_active: true,
    publication_ts_utc: '2026-08-26 19:46:28.922',
    ...overrides,
  };
}

/** Before any of the hours the rows above describe. */
const BEFORE_ALL = new Date('2026-08-27T00:00:00Z');

describe('parseCompass', () => {
  it('reads the hour and the instant from their own fields', () => {
    const [hour] = parseCompass([row(19, 2)]);

    expect(hour.hourLabel).toBe('19:00');
    expect(hour.startUtc.toISOString()).toBe('2026-08-27T17:00:00.000Z');
    expect(hour.level).toBe(2);
    expect(hour.businessDate).toBe('2026-08-27');
  });

  it('takes the label from the local stamp even where the instant disagrees', () => {
    /*
     * The whole reason this layer reads the label out of `dtime` as a substring.
     * The scheduled job runs on a GitHub runner whose clock is UTC, so deriving
     * the label from the instant would report 17:00 for the block PSE calls
     * 19:00 — a two-hour error in the one field the card is read for.
     *
     * Asserted on a DELIBERATELY MISMATCHED pair, and that is the point. Vitest
     * pins TZ to Europe/Warsaw for the whole suite, so under every honest
     * fixture a `getHours()` implementation returns the very same label and the
     * bug this guards against passes every test while being wrong in production.
     * Pulling the two stamps apart is the only way to name which of them the
     * label comes from: `dtime`, whatever the instant says and whatever
     * timezone anything is running in.
     */
    const [hour] = parseCompass([
      row(19, 2, { dtime: '2026-08-27 19:00', dtime_utc: '2026-08-27 06:00' }),
    ]);

    expect(hour.hourLabel).toBe('19:00');
  });

  it('keeps the newest version when one hour arrives twice', () => {
    // pdgsz versions its records: a republished period keeps its superseded row
    // alongside the current one. The fetch filters on is_active, so this is the
    // second guard — and the levels differ, which is what makes picking the
    // wrong one a wrong answer rather than a duplicate.
    const hours = parseCompass([
      row(19, 1, { publication_ts_utc: '2026-08-26 19:46:28.922' }),
      row(19, 3, { publication_ts_utc: '2026-08-27 11:02:00.000' }),
    ]);

    expect(hours).toHaveLength(1);
    expect(hours[0].level).toBe(3);
  });

  it('keeps the newest version whichever order the rows arrive in', () => {
    const hours = parseCompass([
      row(19, 3, { publication_ts_utc: '2026-08-27 11:02:00.000' }),
      row(19, 1, { publication_ts_utc: '2026-08-26 19:46:28.922' }),
    ]);

    expect(hours).toHaveLength(1);
    expect(hours[0].level).toBe(3);
  });

  it('skips a row whose stamps cannot be read rather than guessing', () => {
    const hours = parseCompass([
      row(18, 2, { dtime_utc: 'nie-data' }),
      row(19, 2, { dtime: '' }),
      row(20, 2, { usage_fcst: 'siedem' }),
      row(21, 2),
    ]);

    expect(hours.map((hour) => hour.hourLabel)).toEqual(['21:00']);
  });

  it('accepts a stamp that already carries seconds', () => {
    // Padding is applied only where it is missing, so the day PSE starts writing
    // full stamps needs no change here.
    const hours = parseCompass([
      row(19, 2, { dtime_utc: '2026-08-27 17:00:00' }),
    ]);

    expect(hours[0].startUtc.toISOString()).toBe('2026-08-27T17:00:00.000Z');
  });

  it('returns the hours in order, whatever order they came in', () => {
    const hours = parseCompass([row(21, 2), row(19, 2), row(20, 2)]);

    expect(hours.map((hour) => hour.hourLabel)).toEqual([
      '19:00',
      '20:00',
      '21:00',
    ]);
  });
});

describe('compassRanges', () => {
  it('merges consecutive hours of the same level into one range', () => {
    const ranges = compassRanges(
      parseCompass([row(19, 2), row(20, 2), row(21, 2)]),
      BEFORE_ALL
    );

    expect(ranges).toEqual([{ level: 2, from: '19:00', to: '22:00', hours: 3 }]);
  });

  it('splits where the level changes', () => {
    // 2,2,3,3 is two ranges, not one four-hour span and not four hours. The two
    // levels ask different things of the reader.
    const ranges = compassRanges(
      parseCompass([row(17, 2), row(18, 2), row(19, 3), row(20, 3)]),
      BEFORE_ALL
    );

    expect(ranges).toEqual([
      { level: 2, from: '17:00', to: '19:00', hours: 2 },
      { level: 3, from: '19:00', to: '21:00', hours: 2 },
    ]);
  });

  it('lets a hole cut a range in two', () => {
    /*
     * The mutation this exists for: a merge condition that only compares levels
     * and never the clock reports "17:00-21:00" for a flag PSE raised over
     * 17:00-18:00 and again over 20:00-21:00 — a two-hour span the reader is not
     * being asked to keep, dressed as one he is.
     */
    const ranges = compassRanges(
      parseCompass([row(17, 2), row(18, 1), row(19, 1), row(20, 2)]),
      BEFORE_ALL
    );

    expect(ranges).toEqual([
      { level: 2, from: '17:00', to: '18:00', hours: 1 },
      { level: 2, from: '20:00', to: '21:00', hours: 1 },
    ]);
  });

  it('cuts a range where a day PSE did not publish would fall', () => {
    // Today's last flagged hour and the day after tomorrow's first are not
    // adjacent on the clock, however adjacent they look in a list.
    const ranges = compassRanges(
      parseCompass([
        row(22, 2),
        row(10, 2, {
          business_date: '2026-08-29',
          dtime: '2026-08-29 10:00',
          dtime_utc: '2026-08-29 08:00',
        }),
      ]),
      BEFORE_ALL
    );

    expect(ranges).toHaveLength(2);
  });

  it('makes no range out of normal or recommended-use hours', () => {
    // The mutation this exists for: a threshold of >2 instead of >=2 drops every
    // "zalecane oszczędzanie" silently, and level 2 is the flag PSE actually
    // raises — both flagged days on the live endpoint on 2026-08-27 were level 2.
    expect(compassRanges(parseCompass([row(19, 0), row(20, 1)]), BEFORE_ALL)).toEqual(
      []
    );
    expect(
      compassRanges(parseCompass([row(19, 2)]), BEFORE_ALL)
    ).toEqual([{ level: 2, from: '19:00', to: '20:00', hours: 1 }]);
  });

  it('leaves out hours that are already behind us', () => {
    // Same philosophy as `upcoming` in callPeriod: the hour in progress stays,
    // the ones before it go. Nothing can be done about a flag that has lapsed.
    const hours = parseCompass([row(17, 2), row(18, 2), row(19, 2), row(20, 2)]);

    // 18:30 local, i.e. halfway through the 18:00 block.
    const ranges = compassRanges(hours, new Date('2026-08-27T16:30:00Z'));

    expect(ranges).toEqual([{ level: 2, from: '18:00', to: '21:00', hours: 3 }]);
  });

  it('has nothing to report once every flagged hour has passed', () => {
    const hours = parseCompass([row(17, 2), row(18, 2)]);

    expect(compassRanges(hours, new Date('2026-08-27T20:00:00Z'))).toEqual([]);
  });

  it('closes a range that runs to the end of the day at midnight', () => {
    // The end of a range is one hour past its last block, and pdgsz never states
    // it — so 23:00 has to wrap rather than reading "24:00".
    const ranges = compassRanges(parseCompass([row(23, 3)]), BEFORE_ALL);

    expect(ranges).toEqual([{ level: 3, from: '23:00', to: '00:00', hours: 1 }]);
  });

  it('copes with no rows at all', () => {
    expect(compassRanges([], BEFORE_ALL)).toEqual([]);
    expect(parseCompass([])).toEqual([]);
  });
});

describe('COMPASS_WORD', () => {
  it('names the two flagged levels the way the operator does', () => {
    expect(COMPASS_WORD[2]).toBe('zalecane oszczędzanie');
    expect(COMPASS_WORD[3]).toBe('wymagane ograniczenie poboru');
  });
});
