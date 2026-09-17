import { describe, it, expect } from 'vitest';
import {
  NEWS_MAX_AGE_MS,
  NEWS_STALE_MS,
  formatNewsTime,
  isOfficialSource,
  newsFreshness,
  pickCardRows,
  readNewsFile,
  sourcesOf,
} from '../news';
import type { NewsFile, NewsItem } from '../newsTypes';

const item = (id: string, publishedAt: string, source = 'CIRE'): NewsItem => ({
  id,
  title: `Tytuł ${id}`,
  url: `https://x.pl/${id}`,
  source,
  publishedAt,
});

const file = (overrides: Partial<Record<'sieci' | 'regulacje' | 'energetyka' | 'paliwa', NewsItem[]>> = {}): NewsFile => ({
  generatedAt: '2026-09-17T16:00:00.000Z',
  groups: [
    { id: 'sieci', label: 'Sieci', items: overrides.sieci ?? [item('s1', '2026-09-17T09:39:00Z', 'PSE')] },
    { id: 'regulacje', label: 'Regulacje', items: overrides.regulacje ?? [item('r1', '2026-09-17T13:00:00Z', 'URE')] },
    { id: 'energetyka', label: 'Energetyka', items: overrides.energetyka ?? [item('e1', '2026-09-17T15:12:00Z'), item('e2', '2026-09-17T12:00:00Z')] },
    { id: 'paliwa', label: 'Paliwa i gaz', items: overrides.paliwa ?? [item('p1', '2026-09-17T14:55:00Z', 'wnp.pl')] },
  ],
});

describe('readNewsFile', () => {
  it('accepts a well-formed file', () => {
    expect(readNewsFile(file())?.groups).toHaveLength(4);
  });

  it('drops a single bad item rather than the whole file', () => {
    const bad = file({ energetyka: [item('e1', '2026-09-17T15:12:00Z'), { ...item('e2', '2026-09-17T12:00:00Z'), url: 'http://x.pl/e2' }] });
    expect(readNewsFile(bad)?.groups[2].items.map((i) => i.id)).toEqual(['e1']);
  });

  it('rejects a javascript: link', () => {
    const bad = file({ sieci: [{ ...item('s1', '2026-09-17T09:39:00Z'), url: 'javascript:alert(1)' }] });
    expect(readNewsFile(bad)?.groups[0].items).toEqual([]);
  });

  it('rejects a file without a timestamp, with an unknown group, or with nothing in it', () => {
    expect(readNewsFile({ ...file(), generatedAt: 'wczoraj' })).toBeNull();
    expect(readNewsFile({ ...file(), groups: [{ id: 'sport', label: 'Sport', items: [] }] })).toBeNull();
    expect(readNewsFile(file({ sieci: [], regulacje: [], energetyka: [], paliwa: [] }))).toBeNull();
    expect(readNewsFile(null)).toBeNull();
    expect(readNewsFile('<html>')).toBeNull();
  });
});

describe('pickCardRows', () => {
  it('laptop: the newest headline of all, then the newest from Sieci', () => {
    expect(pickCardRows(file(), 'laptop').map((row) => row.item.id)).toEqual(['e1', 's1']);
  });

  it('laptop: when the newest of all is from Sieci, the second row is the next newest, not a repeat', () => {
    const rows = pickCardRows(file({ sieci: [item('s1', '2026-09-17T15:50:00Z', 'PSE')] }), 'laptop');
    expect(rows.map((row) => row.item.id)).toEqual(['s1', 'e1']);
  });

  it('laptop: Sieci empty still gives two rows', () => {
    expect(pickCardRows(file({ sieci: [] }), 'laptop').map((row) => row.item.id)).toEqual(['e1', 'p1']);
  });

  it('monitor: the newest of each group in reading order, skipping an empty one', () => {
    const rows = pickCardRows(file({ regulacje: [] }), 'monitor');
    expect(rows.map((row) => [row.group.label, row.item.id])).toEqual([
      ['Sieci', 's1'],
      ['Energetyka', 'e1'],
      ['Paliwa i gaz', 'p1'],
    ]);
  });
});

describe('formatNewsTime', () => {
  const now = new Date('2026-09-17T18:10:00+02:00');

  it('writes a clock time today, "wczoraj" yesterday and a date before that', () => {
    expect(formatNewsTime('2026-09-17T17:12:00+02:00', now)).toBe('17:12');
    expect(formatNewsTime('2026-09-16T00:05:00+02:00', now)).toBe('wczoraj 00:05');
    expect(formatNewsTime('2026-09-15T23:59:00+02:00', now)).toBe('15.09');
  });
});

describe('newsFreshness', () => {
  const at = (ms: number) => new Date(Date.parse(file().generatedAt) + ms);

  it('is fresh up to four hours, stale up to twelve, then expired', () => {
    expect(newsFreshness(file(), at(NEWS_STALE_MS))).toBe('fresh');
    expect(newsFreshness(file(), at(NEWS_STALE_MS + 1))).toBe('stale');
    expect(newsFreshness(file(), at(NEWS_MAX_AGE_MS))).toBe('stale');
    expect(newsFreshness(file(), at(NEWS_MAX_AGE_MS + 1))).toBe('expired');
  });
});

describe('sources', () => {
  it('marks only the operator and the regulator as official', () => {
    expect(isOfficialSource('PSE')).toBe(true);
    expect(isOfficialSource('URE')).toBe(true);
    expect(isOfficialSource('CIRE')).toBe(false);
  });

  it('lists each outlet once, in order of appearance', () => {
    expect(sourcesOf(file())).toEqual(['PSE', 'URE', 'CIRE', 'wnp.pl']);
  });
});
