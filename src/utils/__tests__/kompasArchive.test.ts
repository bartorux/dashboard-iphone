import { describe, it, expect } from 'vitest';
import {
  newCompassArchiveLines,
  parseCompassArchiveLines,
  lastCompassValuesFrom,
  compassVersionRows,
} from '../kompasArchive';
import type { PSECompassRawItem } from '../../types';

/** A raw pdgsz row, shaped exactly as the live endpoint serves it. */
function row(
  localHour: number,
  usage: number | string,
  overrides: Partial<PSECompassRawItem> = {}
): PSECompassRawItem {
  const pad = (value: number) => String(value).padStart(2, '0');
  const utcHour = localHour - 2;
  return {
    business_date: '2026-08-29',
    dtime: `2026-08-29 ${pad(localHour)}:00`,
    dtime_utc: `2026-08-29 ${pad(utcHour)}:00`,
    usage_fcst: usage,
    is_active: true,
    publication_ts_utc: '2026-08-28 16:42:11.322',
    ...overrides,
  };
}

describe('newCompassArchiveLines — dedupe by level and publication stamp', () => {
  it('writes nothing when level and publication stamp both repeat the last archived value', () => {
    const lastByKey = new Map([
      ['2026-08-29#19', { level: 2 as const, publicationTsUtc: '2026-08-28T16:42:11Z' }],
    ]);
    const lines = newCompassArchiveLines(
      [row(19, 2)],
      lastByKey,
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toEqual([]);
  });

  it('writes a line when the level changes but the publication stamp does not', () => {
    const lastByKey = new Map([
      ['2026-08-29#19', { level: 1 as const, publicationTsUtc: '2026-08-28T16:42:11Z' }],
    ]);
    const lines = newCompassArchiveLines(
      [row(19, 2)],
      lastByKey,
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual([
      '2026-08-29',
      19,
      2,
      '2026-08-28T16:42:11Z',
      '2026-08-29T18:00:00Z',
    ]);
  });

  /**
   * The other half of the dedupe key: PSE can republish the exact same level
   * under a new version stamp (a no-op revision, or a correction that lands
   * back on the original figure) and that is still news worth a line, because
   * it is a NEW version existing at a NEW instant — the whole point of this
   * archive is to know which version was live when.
   */
  it('writes a line when only the publication stamp changes, level held', () => {
    const lastByKey = new Map([
      ['2026-08-29#19', { level: 2 as const, publicationTsUtc: '2026-08-28T16:42:11Z' }],
    ]);
    const lines = newCompassArchiveLines(
      [row(19, 2, { publication_ts_utc: '2026-08-29 09:00:00.000' })],
      lastByKey,
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toHaveLength(1);
    const [, , , publicationTsUtc] = JSON.parse(lines[0]);
    expect(publicationTsUtc).toBe('2026-08-29T09:00:00Z');
  });

  it('writes a line for a brand-new key not present in lastByKey', () => {
    const lines = newCompassArchiveLines([row(19, 2)], new Map(), '2026-08-29T18:00:00Z');
    expect(lines).toHaveLength(1);
  });

  it('dedupes a second row in the same batch against the first, not only against disk', () => {
    const rows = [row(19, 2), row(19, 2)];
    const lines = newCompassArchiveLines(rows, new Map(), '2026-08-29T18:00:00Z');
    expect(lines).toHaveLength(1);
  });

  it('leaves the caller-supplied lastByKey untouched', () => {
    const lastByKey = new Map([
      ['2026-08-29#19', { level: 1 as const, publicationTsUtc: '' }],
    ]);
    newCompassArchiveLines([row(19, 2)], lastByKey, '2026-08-29T18:00:00Z');
    expect(lastByKey.get('2026-08-29#19')).toEqual({ level: 1, publicationTsUtc: '' });
  });

  it('skips a row whose stamps cannot be read, same as parseCompass', () => {
    const lines = newCompassArchiveLines(
      [row(19, 2, { dtime_utc: 'nie-data' })],
      new Map(),
      '2026-08-29T18:00:00Z'
    );
    expect(lines).toEqual([]);
  });

  it('writes an empty publication timestamp when PSE sent none', () => {
    const [line] = newCompassArchiveLines(
      [row(19, 2, { publication_ts_utc: undefined })],
      new Map(),
      '2026-08-29T18:00:00Z'
    );
    const [, , , publicationTs] = JSON.parse(line);
    expect(publicationTs).toBe('');
  });

  it('matches the committed format exactly: compact array, no pretty-print', () => {
    const [line] = newCompassArchiveLines([row(19, 2)], new Map(), '2026-08-28T17:37:02Z');
    expect(line).toBe(
      '["2026-08-29",19,2,"2026-08-28T16:42:11Z","2026-08-28T17:37:02Z"]'
    );
  });
});

describe('parseCompassArchiveLines', () => {
  it('reads a well-formed line back into its key and value', () => {
    const text =
      '["2026-08-29",19,2,"2026-08-28T16:42:11Z","2026-08-28T17:37:02Z"]\n';
    const parsed = parseCompassArchiveLines(text);
    expect(parsed.get('2026-08-29#19')).toEqual({
      level: 2,
      publicationTsUtc: '2026-08-28T16:42:11Z',
    });
  });

  it('returns an empty map for empty text', () => {
    expect(parseCompassArchiveLines('').size).toBe(0);
  });

  it('skips a line that is not valid JSON, rather than throwing', () => {
    const text = [
      '["2026-08-29",19,2,"","2026-08-28T17:37:02Z"]',
      '["2026-08-29",20,3', // truncated, as an interrupted write might leave it
    ].join('\n');
    expect(() => parseCompassArchiveLines(text)).not.toThrow();
    const parsed = parseCompassArchiveLines(text);
    expect(parsed.size).toBe(1);
    expect(parsed.has('2026-08-29#20')).toBe(false);
  });

  it('skips lines with the wrong shape (length, types, out-of-range hour/level)', () => {
    const text = [
      '["2026-08-29",19,2]', // too short
      '["2026-08-29","19",2,"","2026-08-28T17:37:02Z"]', // hour as string
      '["2026-08-29",24,2,"","2026-08-28T17:37:02Z"]', // hour out of range
      '["2026-08-29",19,4,"","2026-08-28T17:37:02Z"]', // level out of range
      '["not-a-date",19,2,"","2026-08-28T17:37:02Z"]', // bad businessDate
    ].join('\n');
    expect(parseCompassArchiveLines(text).size).toBe(0);
  });

  it('keeps the LAST value for a repeated key, matching append order', () => {
    const text = [
      '["2026-08-29",19,1,"","2026-08-28T16:00:00Z"]',
      '["2026-08-29",19,3,"","2026-08-28T17:00:00Z"]',
    ].join('\n');
    expect(parseCompassArchiveLines(text).get('2026-08-29#19')).toEqual({
      level: 3,
      publicationTsUtc: '',
    });
  });
});

describe('reconstructing lastByKey across a month boundary', () => {
  it('merges two partitions, with the current month winning on a shared key', () => {
    const previousMonth = parseCompassArchiveLines(
      [
        '["2026-09-03",19,2,"","2026-08-30T10:00:00Z"]',
        '["2026-09-04",9,1,"","2026-08-31T11:00:00Z"]',
      ].join('\n')
    );
    const currentMonth = parseCompassArchiveLines(
      '["2026-09-03",19,3,"","2026-09-01T09:00:00Z"]'
    );

    const merged = new Map([...previousMonth, ...currentMonth]);

    // Updated in September: the newer value wins.
    expect(merged.get('2026-09-03#19')).toEqual({ level: 3, publicationTsUtc: '' });
    // Untouched since August: still there, read from the older partition.
    expect(merged.get('2026-09-04#9')).toEqual({ level: 1, publicationTsUtc: '' });
  });
});

describe('lastCompassValuesFrom', () => {
  const linia = (d: string, h: number, level: number) =>
    JSON.stringify([d, h, level, '', '2026-08-28T10:00:00Z']);

  it('folds partitions in order, later text winning duplicate keys', () => {
    const poprzednia = [linia('2026-09-02', 19, 1)].join('\n');
    const biezaca = [linia('2026-09-02', 19, 3)].join('\n');

    const zObu = lastCompassValuesFrom([poprzednia, biezaca]);
    expect(zObu.get('2026-09-02#19')).toEqual({ level: 3, publicationTsUtc: '' });

    const tylkoBiezaca = lastCompassValuesFrom(['', biezaca]);
    const bezPoprzedniej = lastCompassValuesFrom([biezaca]);
    expect(tylkoBiezaca).toEqual(bezPoprzedniej);

    // A key living ONLY in the previous partition must survive the fold.
    const osobny = lastCompassValuesFrom([linia('2026-08-31', 20, 2), biezaca]);
    expect(osobny.get('2026-08-31#20')).toEqual({ level: 2, publicationTsUtc: '' });
  });
});

describe('compassVersionRows', () => {
  it('reads every version, not folded down to the last one per key', () => {
    const text = [
      '["2026-09-02",20,1,"2026-08-30T10:00:00Z","2026-08-30T10:05:00Z"]',
      '["2026-09-02",20,2,"2026-09-01T15:40:00Z","2026-09-01T15:45:00Z"]',
    ].join('\n');

    const rows = compassVersionRows(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      businessDate: '2026-09-02',
      hour: 20,
      level: 1,
      publishedAt: '2026-08-30T10:00:00Z',
    });
    expect(rows[1].level).toBe(2);
  });

  /**
   * The one field this function computes rather than copies: when PSE sent no
   * publication stamp for a version, `readAt` is the best approximation this
   * tool has of when that version became visible — the instant the job itself
   * observed it, since no PSE-side timestamp exists to use instead.
   */
  it('falls back to readAt when PSE sent no publication stamp', () => {
    const text = '["2026-09-02",20,2,"","2026-09-01T15:45:00Z"]';
    const [row] = compassVersionRows(text);
    expect(row.publishedAt).toBe('2026-09-01T15:45:00Z');
  });

  it('skips a malformed line rather than throwing', () => {
    const text = [
      '["2026-09-02",20,2,"","2026-09-01T15:45:00Z"]',
      '["2026-09-02",24,2,"","2026-09-01T15:45:00Z"]', // hour out of range
    ].join('\n');
    expect(compassVersionRows(text)).toHaveLength(1);
  });

  it('returns an empty array for empty text', () => {
    expect(compassVersionRows('')).toEqual([]);
  });
});
