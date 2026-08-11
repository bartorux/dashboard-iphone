import { describe, it, expect } from 'vitest';
import { dayRangeLabel, localDate } from '../dayLabels';

const NOW = new Date('2026-08-09T12:00:00');

describe('localDate', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // Late evening in Warsaw is already the next day in UTC; the label must
    // follow the reader's calendar, which is what PSE labels days by too.
    expect(localDate(new Date(2026, 7, 9, 23, 30))).toBe('2026-08-09');
    expect(localDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('dayRangeLabel', () => {
  it('names the usual three-day span', () => {
    expect(
      dayRangeLabel(['2026-08-09', '2026-08-10', '2026-08-11'], NOW)
    ).toBe('dziś–pojutrze');
  });

  it('collapses to one name when only one day is left', () => {
    // Late in the evening today is spent and the summary covers tomorrow alone.
    expect(dayRangeLabel(['2026-08-10'], NOW)).toBe('jutro');
  });

  it('names a two-day span', () => {
    expect(dayRangeLabel(['2026-08-10', '2026-08-11'], NOW)).toBe(
      'jutro–pojutrze'
    );
  });

  it('is not fooled by the order it receives', () => {
    expect(
      dayRangeLabel(['2026-08-11', '2026-08-09', '2026-08-10'], NOW)
    ).toBe('dziś–pojutrze');
  });

  it('gives a bare date for a day already past', () => {
    // A stale file read the next morning must not call yesterday "today", and a
    // weekday would lie by omission here: "sob." cannot say whether it means the
    // Saturday just gone or the one coming. This label exists for exactly that
    // case, so backwards it stays a date.
    expect(dayRangeLabel(['2026-08-08', '2026-08-09'], NOW)).toBe('8.08–dziś');
  });

  it('names a day ahead by its weekday, as the tabs and the summary do', () => {
    // Beyond "pojutrze" the app used to print a bare date, which read as a
    // stumble once the window reached five days: "dziś–14.08" mixes a word with
    // a number for no reason a reader can see. Forwards inside the week a
    // weekday is unambiguous.
    expect(dayRangeLabel(['2026-08-15'], NOW)).toBe('sob.');
    expect(dayRangeLabel(['2026-08-09', '2026-08-14'], NOW)).toBe('dziś–pt.');
  });

  it('still gives a date once a weekday would stop being unambiguous', () => {
    // A week out, "niedz." could be either of two Sundays.
    expect(dayRangeLabel(['2026-08-16'], NOW)).toBe('16.08');
  });

  it('gives nothing rather than a broken label', () => {
    expect(dayRangeLabel([], NOW)).toBeNull();
    expect(dayRangeLabel(['nie-data'], NOW)).toBeNull();
  });
});
