import { describe, it, expect } from 'vitest';
import {
  archivePartition,
  newArchiveLines,
  parseArchiveLines,
  previousPartition,
} from '../pk5lArchive';
import type { PSERawItem } from '../../types';

/** A raw pk5l-wp row, shaped like the live endpoint actually returns it. */
function rawRow(overrides: Partial<PSERawItem> = {}): PSERawItem {
  return {
    business_date: '2026-08-29',
    period: '18 - 19',
    plan_dtime: '2026-08-29 19:00:00',
    plan_dtime_utc: '2026-08-29 17:00:00',
    req_pow_res: 1964,
    surplus_cap_avail_tso: 2101,
    ...overrides,
  };
}

describe('archivePartition', () => {
  it('keys the partition on the UTC calendar month', () => {
    expect(archivePartition(new Date('2026-08-29T12:00:00Z'))).toBe('2026-08');
    expect(archivePartition(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('reads UTC even when local wall time has already rolled to the next month', () => {
    // 23:30 UTC on 31 August is 01:30 local (Europe/Warsaw, +2 in summer) on
    // 1 September. A partition keyed on local time would split this single
    // instant into next month's file, which nothing else in the archive
    // would ever look at again — the whole point of a fixed UTC key.
    expect(archivePartition(new Date('2026-08-31T23:30:00Z'))).toBe('2026-08');
  });
});

describe('previousPartition', () => {
  it('steps back one calendar month', () => {
    expect(previousPartition('2026-09')).toBe('2026-08');
  });

  it('rolls the year back in January', () => {
    expect(previousPartition('2026-01')).toBe('2025-12');
  });

  it('passes through anything it cannot parse', () => {
    expect(previousPartition('bogus')).toBe('bogus');
  });
});

describe('parseArchiveLines', () => {
  it('reads a well-formed line back into its key and value', () => {
    const text = '["2026-08-29",18,2101,1964,"2026-08-28T16:42:11Z","2026-08-28T17:37:02Z"]\n';
    const parsed = parseArchiveLines(text);
    expect(parsed.get('2026-08-29#18')).toEqual([2101, 1964]);
  });

  it('returns an empty map for empty text', () => {
    expect(parseArchiveLines('').size).toBe(0);
  });

  it('skips a line that is not valid JSON, rather than throwing', () => {
    const text = [
      '["2026-08-29",18,2101,1964,"","2026-08-28T17:37:02Z"]',
      '["2026-08-29",19,2200,1', // truncated, as an interrupted write might leave it
    ].join('\n');
    expect(() => parseArchiveLines(text)).not.toThrow();
    const parsed = parseArchiveLines(text);
    expect(parsed.size).toBe(1);
    expect(parsed.has('2026-08-29#19')).toBe(false);
  });

  it('skips lines with the wrong shape (length, types, out-of-range hour)', () => {
    const text = [
      '["2026-08-29",18,2101]', // too short
      '["2026-08-29","18",2101,1964,"","2026-08-28T17:37:02Z"]', // hour as string
      '["2026-08-29",24,2101,1964,"","2026-08-28T17:37:02Z"]', // hour out of range
      '["not-a-date",18,2101,1964,"","2026-08-28T17:37:02Z"]', // bad businessDate
    ].join('\n');
    expect(parseArchiveLines(text).size).toBe(0);
  });

  it('keeps the LAST value for a repeated key, matching append order', () => {
    const text = [
      '["2026-08-29",18,2101,1964,"","2026-08-28T16:00:00Z"]',
      '["2026-08-29",18,1900,1964,"","2026-08-28T17:00:00Z"]',
    ].join('\n');
    expect(parseArchiveLines(text).get('2026-08-29#18')).toEqual([1900, 1964]);
  });
});

describe('newArchiveLines — dedupe by value', () => {
  it('writes nothing when surplus and required repeat the last archived value', () => {
    const lastByKey = new Map([['2026-08-29#18', [2101, 1964] as const]]);
    const lines = newArchiveLines([rawRow()], lastByKey, '2026-08-29T18:00:00Z');
    expect(lines).toEqual([]);
  });

  /**
   * The dedupe key is the VALUE, not PSE republishing the row: a revision
   * that only touches publication_ts_utc, leaving the reserve figures
   * unchanged, must still write nothing. Deduping on the publication stamp
   * instead of the pair would treat this as a change and archive a line that
   * carries no news.
   */
  it('still writes nothing when only PSE republication_ts_utc changes, values held', () => {
    const lastByKey = new Map([['2026-08-29#18', [2101, 1964] as const]]);
    const row = rawRow({
      surplus_cap_avail_tso: 2101,
      req_pow_res: 1964,
      // @ts-expect-error -- not on PSERawItem yet; api.ts does not select it
      // from the live endpoint, so this exercises the type-cast read path.
      publication_ts_utc: '2026-08-28T23:00:00.000',
    });
    const lines = newArchiveLines([row], lastByKey, '2026-08-29T18:00:00Z');
    expect(lines).toEqual([]);
  });

  it('writes a line for a swing of exactly 1 MW', () => {
    const lastByKey = new Map([['2026-08-29#18', [2100, 1964] as const]]);
    const lines = newArchiveLines(
      [rawRow({ surplus_cap_avail_tso: 2101 })],
      lastByKey,
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual([
      '2026-08-29',
      18,
      2101,
      1964,
      '',
      '2026-08-29T18:00:00Z',
    ]);
  });

  it('writes a line for a brand-new key not present in lastByKey', () => {
    const lines = newArchiveLines([rawRow()], new Map(), '2026-08-29T18:00:00Z');
    expect(lines).toHaveLength(1);
  });

  it('dedupes a second row in the same batch against the first, not only against disk', () => {
    const rows = [rawRow(), rawRow()]; // identical readings, as a duplicate API row would be
    const lines = newArchiveLines(rows, new Map(), '2026-08-29T18:00:00Z');
    expect(lines).toHaveLength(1);
  });

  it('leaves the caller-supplied lastByKey untouched', () => {
    const lastByKey = new Map([['2026-08-29#18', [2100, 1964] as const]]);
    newArchiveLines([rawRow({ surplus_cap_avail_tso: 2101 })], lastByKey, '2026-08-29T18:00:00Z');
    expect(lastByKey.get('2026-08-29#18')).toEqual([2100, 1964]);
  });
});

describe('newArchiveLines — hour from the period string', () => {
  it('reads the closing block "23 - 24" as hour 23', () => {
    // Chosen so that a same-day (getHours) reading in Europe/Warsaw — the
    // timezone the whole suite is pinned to — would NOT accidentally land on
    // 23 by coincidence: plan_dtime carries the block's local END (00:00 the
    // next day), and plan_dtime_utc carries the same instant eight hours
    // earlier than the block start, in UTC.
    const row = rawRow({
      business_date: '2026-08-28',
      period: '23 - 24',
      plan_dtime: '2026-08-29 00:00:00',
      plan_dtime_utc: '2026-08-28 22:00:00',
    });
    const [line] = newArchiveLines([row], new Map(), '2026-08-28T22:05:00Z');
    const [, hour] = JSON.parse(line);
    expect(hour).toBe(23);
  });

  it('reads an ordinary block, "07 - 08", as hour 7', () => {
    const row = rawRow({ period: '07 - 08' });
    const [line] = newArchiveLines([row], new Map(), '2026-08-29T07:05:00Z');
    const [, hour] = JSON.parse(line);
    expect(hour).toBe(7);
  });

  it('skips a row whose period cannot be parsed', () => {
    const lines = newArchiveLines(
      [rawRow({ period: 'nonsense' }), rawRow({ period: '' })],
      new Map(),
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toEqual([]);
  });
});

describe('newArchiveLines — values that cannot be archived', () => {
  it('skips a row with no surplus published', () => {
    const lines = newArchiveLines(
      [rawRow({ surplus_cap_avail_tso: null })],
      new Map(),
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toEqual([]);
  });

  it('skips a row with an unparseable required figure', () => {
    const lines = newArchiveLines(
      [rawRow({ req_pow_res: 'n/a' })],
      new Map(),
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toEqual([]);
  });
});

describe('newArchiveLines — line format', () => {
  it('matches the committed format exactly: compact array, no pretty-print', () => {
    const row = rawRow({
      business_date: '2026-08-29',
      period: '18 - 19',
      surplus_cap_avail_tso: 2101,
      req_pow_res: 1964,
    });
    // @ts-expect-error -- see the note on the dedupe test above.
    row.publication_ts_utc = '2026-08-28 16:42:11.322';

    const [line] = newArchiveLines([row], new Map(), '2026-08-28T17:37:02Z');

    expect(line).toBe(
      '["2026-08-29",18,2101,1964,"2026-08-28T16:42:11Z","2026-08-28T17:37:02Z"]'
    );
    // Round-trips to exactly the six fields the format promises.
    expect(JSON.parse(line)).toEqual([
      '2026-08-29',
      18,
      2101,
      1964,
      '2026-08-28T16:42:11Z',
      '2026-08-28T17:37:02Z',
    ]);
  });

  it('writes an empty publication timestamp when PSE sent none', () => {
    const [line] = newArchiveLines([rawRow()], new Map(), '2026-08-29T18:00:00Z');
    const [, , , , publicationTs] = JSON.parse(line);
    expect(publicationTs).toBe('');
  });
});

describe('reconstructing lastByKey across a month boundary', () => {
  it('merges two partitions, with the current month winning on a shared key', () => {
    // A business date up to ~5 days into September can already have snapshots
    // filed under August's partition (the run that recorded them still fell
    // in August), and later ones under September's own file.
    const previousMonth = parseArchiveLines(
      [
        '["2026-09-03",18,2101,1964,"","2026-08-30T10:00:00Z"]',
        '["2026-09-04",9,1500,1400,"","2026-08-31T11:00:00Z"]',
      ].join('\n')
    );
    const currentMonth = parseArchiveLines(
      '["2026-09-03",18,1990,1964,"","2026-09-01T09:00:00Z"]'
    );

    const merged = new Map([...previousMonth, ...currentMonth]);

    // Updated in September: the newer value wins.
    expect(merged.get('2026-09-03#18')).toEqual([1990, 1964]);
    // Untouched since August: still there, read from the older partition.
    expect(merged.get('2026-09-04#9')).toEqual([1500, 1400]);
  });
});
