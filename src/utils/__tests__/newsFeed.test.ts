import { describe, it, expect } from 'vitest';
import wnpXml from '../__fixtures__/news/wnp.xml?raw';
import e24Xml from '../__fixtures__/news/e24.xml?raw';
import ureXml from '../__fixtures__/news/ure.xml?raw';
import cireXml from '../__fixtures__/news/cire.xml?raw';
import wnnXml from '../__fixtures__/news/wnn.xml?raw';
import pseXml from '../__fixtures__/news/pseosp.xml?raw';
import {
  buildNewsFile,
  cleanTitle,
  decodeEntities,
  groupFor,
  hashId,
  normalizeUrl,
  parseFeed,
  parseFeedDate,
} from '../newsFeed';
import type { FeedEntry, FeedSpec } from '../newsFeed';

/** Fixtures are the real feeds of 17.09.2026, trimmed to their first entries. */
const NOW = new Date('2026-09-17T16:30:00Z');

const spec = (overrides: Partial<FeedSpec>): FeedSpec => ({
  id: 'test',
  url: 'https://example.pl/feed',
  source: 'Test',
  group: 'energetyka',
  ...overrides,
});

const entry = (title: string, url: string, iso: string): FeedEntry => ({ title, url, publishedAt: new Date(iso) });

describe('parseFeed', () => {
  it('reads RSS items with CDATA titles and zoned dates (Energetyka24)', () => {
    const entries = parseFeed(e24Xml);
    expect(entries).toHaveLength(8);
    expect(entries[0].title).toBe('Polscy ministrowie na spotkaniu Grupy G20 w Teksasie. W centrum rozmów energetyka');
    expect(entries[0].url).toBe(
      'https://energetyka24.com/polityka/wydarzenia/polscy-ministrowie-na-spotkaniu-grupy-g20-w-teksasie-w-centrum-rozmow-energetyka'
    );
    expect(entries[0].publishedAt?.toISOString()).toBe('2026-09-17T15:12:25.000Z');
  });

  it('reads Atom entries: the alternate link, not the feed title or self link (PSE)', () => {
    const entries = parseFeed(pseXml);
    expect(entries).toHaveLength(6);
    expect(entries.map((e) => e.title)).not.toContain('Komunikaty OSP');
    expect(entries[0].url).toMatch(/^https:\/\/www\.pse\.pl\/-\/informacja-operatora/);
    expect(entries[0].publishedAt?.toISOString()).toBe('2026-09-17T13:15:00.000Z');
  });

  it('reads a date without a zone as Warsaw time (wnp.pl)', () => {
    const first = parseFeed(wnpXml)[0];
    expect(first.title).toBe('Polska może mieć ukryte bogactwo, którego chce cała Unia. Ruszają poszukiwania');
    // "Thu, 17 Sep 2026 18:06:44" in Poland is 16:06:44 UTC in summer.
    expect(first.publishedAt?.toISOString()).toBe('2026-09-17T16:06:44.000Z');
  });

  it('decodes entities inside links (CIRE)', () => {
    const first = parseFeed(cireXml)[0];
    expect(first.url).toContain('?utm_source=rss&utm_campaign=rss');
    expect(first.url).not.toContain('&amp;');
  });

  it('returns nothing for markup that is not a feed', () => {
    expect(parseFeed('<html><body>Request Rejected</body></html>')).toEqual([]);
  });
});

describe('parseFeedDate', () => {
  it.each([
    ['Thu, 17 Sep 2026 15:55:00 +0200', '2026-09-17T13:55:00.000Z'],
    ['Thu, 17 Sep 2026 14:00:00 GMT', '2026-09-17T14:00:00.000Z'],
    ['Thu, 17 Sep 2026 18:06:44', '2026-09-17T16:06:44.000Z'],
    ['Thu, 15 Jan 2026 12:00:00', '2026-01-15T11:00:00.000Z'],
    ['2026-09-17T13:15:00Z', '2026-09-17T13:15:00.000Z'],
    ['2026-09-17T13:15:00+02:00', '2026-09-17T11:15:00.000Z'],
    ['2026-09-17T13:15:00', '2026-09-17T11:15:00.000Z'],
    ['2026-01-15T13:15:00', '2026-01-15T12:15:00.000Z'],
  ])('%s', (input, expected) => {
    expect(parseFeedDate(input)?.toISOString()).toBe(expected);
  });

  it('gives up on anything else', () => {
    expect(parseFeedDate('wczoraj')).toBeNull();
    expect(parseFeedDate('Thu, 17 Foo 2026 18:06:44')).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('handles named, decimal and hex references', () => {
    expect(decodeEntities('A &amp; B &#8211; &#x142;&oacute;d&#378;')).toBe('A & B – łódź');
  });

  it('leaves an unknown name alone', () => {
    expect(decodeEntities('&foo; zostaje')).toBe('&foo; zostaje');
  });
});

describe('cleanTitle', () => {
  it('drops a title that says nothing', () => {
    expect(cleanTitle('Komunikat')).toBeNull();
    expect(cleanTitle('  komunikat ')).toBeNull();
    expect(cleanTitle('')).toBeNull();
  });

  it('drops the full stop closing a headline', () => {
    expect(cleanTitle('Komunikat OSP dotyczący zawieszenia procesu w dniu 22.09.2026.')).toBe(
      'Komunikat OSP dotyczący zawieszenia procesu w dniu 22.09.2026'
    );
    expect(cleanTitle('Na ten cel przeznaczono niemal 25 mld złotych.')).toBe('Na ten cel przeznaczono niemal 25 mld złotych');
  });

  it('keeps the full stop of an abbreviation and an ellipsis', () => {
    expect(cleanTitle('udział OZE w 2025 r.')).toBe('udział OZE w 2025 r.');
    expect(cleanTitle('niemal 25 mld zł.')).toBe('niemal 25 mld zł.');
    expect(cleanTitle('Co dalej...')).toBe('Co dalej...');
  });
});

describe('groupFor', () => {
  const wnp = spec({ group: 'auto', topical: true });

  it('keeps only industry headlines from a general business feed', () => {
    expect(groupFor(wnp, 'Dolar może stać się walutą kolejnego kraju. Presja USA narasta')).toBeNull();
    expect(groupFor(wnp, 'Gorąco na rynku ważnego metalu. Nawet Chiny nie dają rady')).toBeNull();
    expect(groupFor(wnp, 'Nie chcą wydzielenia kopalń i elektrowni do odrębnych spółek')).toBe('energetyka');
  });

  it('sends fuel headlines to Paliwa i gaz, including inflected forms', () => {
    expect(groupFor(wnp, 'Orlen zdecydował ws. cen paliw')).toBe('paliwa');
    expect(groupFor(wnp, 'Saudyjski rurociąg wkrótce wróci do pracy? Ceny ropy spadają')).toBe('paliwa');
    expect(groupFor(wnp, 'Handel ropą przez cieśninę wstrzymany')).toBe('paliwa');
    expect(groupFor(wnp, 'Europa kupuje więcej LNG')).toBe('paliwa');
  });

  it('does not read "ropa" into longer words', () => {
    expect(groupFor(spec({ group: 'auto' }), 'Europa przyspiesza z energetyką')).toBe('energetyka');
  });

  it('keeps the fixed group of a category feed, whatever the words', () => {
    expect(groupFor(spec({ group: 'sieci' }), 'Co wybory w Szwecji oznaczają dla gazu?')).toBe('sieci');
  });
});

describe('normalizeUrl and hashId', () => {
  it('treats tracking parameters and a trailing slash as the same article', () => {
    expect(normalizeUrl('https://www.cire.pl/a/b/?utm_source=rss&utm_medium=link')).toBe(
      normalizeUrl('https://WWW.cire.pl/a/b')
    );
  });

  it('keeps parameters that identify the page', () => {
    expect(normalizeUrl('https://x.pl/a?id=5&utm_source=rss')).toBe('https://x.pl/a?id=5');
  });

  it('hashes to eight stable hex digits', () => {
    expect(hashId('https://x.pl/a')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashId('https://x.pl/a')).toBe(hashId('https://x.pl/a'));
    expect(hashId('https://x.pl/a')).not.toBe(hashId('https://x.pl/b'));
  });
});

describe('buildNewsFile', () => {
  const feeds = [
    { spec: spec({ id: 'pse-osp', source: 'PSE', group: 'sieci' }), entries: parseFeed(pseXml) },
    { spec: spec({ id: 'ure', source: 'URE', group: 'regulacje' }), entries: parseFeed(ureXml) },
    { spec: spec({ id: 'cire', source: 'CIRE', group: 'energetyka' }), entries: parseFeed(cireXml) },
    { spec: spec({ id: 'wnn', source: 'Wysokie Napięcie', group: 'energetyka' }), entries: parseFeed(wnnXml) },
    { spec: spec({ id: 'e24', source: 'Energetyka24', group: 'auto', topical: true }), entries: parseFeed(e24Xml) },
    { spec: spec({ id: 'wnp', source: 'wnp.pl', group: 'auto', topical: true }), entries: parseFeed(wnpXml) },
  ];
  const file = buildNewsFile(feeds, NOW);
  const all = file.groups.flatMap((group) => group.items);
  const titles = all.map((item) => item.title);

  it('writes all four groups in reading order', () => {
    expect(file.generatedAt).toBe(NOW.toISOString());
    expect(file.groups.map((group) => group.id)).toEqual(['sieci', 'regulacje', 'energetyka', 'paliwa']);
  });

  it('leaves out the URE notice titled only "Komunikat"', () => {
    expect(titles).not.toContain('Komunikat');
    expect(titles.some((title) => title.startsWith('Aukcje OZE'))).toBe(true);
  });

  it('collapses the PSE notice published twice into its later copy', () => {
    const copies = all.filter((item) => item.title.endsWith('w dniu 22.09.2026'));
    expect(copies).toHaveLength(1);
    expect(copies[0].publishedAt).toBe('2026-09-15T05:52:00.000Z');
  });

  it('keeps only the industry headlines of wnp.pl — three of eight on 17.09', () => {
    const fromWnp = all.filter((item) => item.source === 'wnp.pl').map((item) => item.title);
    expect(fromWnp).toHaveLength(3);
    expect(fromWnp.join(' ')).not.toMatch(/Dolar|metalu|Kanada|ukryte bogactwo|spółka technologiczna/);
  });

  it('sorts each group newest first, caps it at eight, and gives every item a unique id', () => {
    for (const group of file.groups) {
      expect(group.items.length).toBeLessThanOrEqual(8);
      const times = group.items.map((item) => Date.parse(item.publishedAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    }
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
  });

  it('drops links that are not https, entries without a date, and anything from the future', () => {
    const result = buildNewsFile(
      [
        {
          spec: spec({}),
          entries: [
            entry('Elektrownia A', 'http://x.pl/a', '2026-09-17T10:00:00Z'),
            entry('Elektrownia B', 'javascript:alert(1)', '2026-09-17T10:00:00Z'),
            { title: 'Elektrownia C', url: 'https://x.pl/c', publishedAt: null },
            entry('Konferencja D', 'https://x.pl/d', '2026-10-01T10:00:00Z'),
            entry('Elektrownia E', 'https://x.pl/e', '2026-09-17T10:00:00Z'),
          ],
        },
      ],
      NOW
    );
    expect(result.groups.flatMap((group) => group.items).map((item) => item.title)).toEqual(['Elektrownia E']);
  });

  it('keeps Regulacje for two weeks and the other groups for three days', () => {
    const tenDaysAgo = '2026-09-07T10:00:00Z';
    const result = buildNewsFile(
      [
        { spec: spec({ group: 'regulacje' }), entries: [entry('Taryfa URE', 'https://x.pl/r', tenDaysAgo)] },
        { spec: spec({ group: 'energetyka' }), entries: [entry('Elektrownia stara', 'https://x.pl/e', tenDaysAgo)] },
      ],
      NOW
    );
    expect(result.groups.find((g) => g.id === 'regulacje')?.items).toHaveLength(1);
    expect(result.groups.find((g) => g.id === 'energetyka')?.items).toHaveLength(0);
  });

  it('keeps a duplicate in the group of the feed listed first', () => {
    const result = buildNewsFile(
      [
        { spec: spec({ group: 'sieci' }), entries: [entry('Luka w ustawie sieciowej', 'https://x.pl/a/', '2026-09-15T08:47:00Z')] },
        { spec: spec({ group: 'energetyka' }), entries: [entry('Luka w ustawie sieciowej', 'https://x.pl/a?utm_source=rss', '2026-09-15T08:47:00Z')] },
      ],
      NOW
    );
    expect(result.groups.find((g) => g.id === 'sieci')?.items).toHaveLength(1);
    expect(result.groups.find((g) => g.id === 'energetyka')?.items).toHaveLength(0);
  });
});
