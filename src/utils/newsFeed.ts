import { NEWS_GROUPS, isHttpsUrl } from './news';
import type { NewsFile, NewsGroupId, NewsItem } from './newsTypes';

/**
 * Feeds to public/news.json. Generator-side only (scripts/news.ts); nothing in
 * the browser imports this file.
 *
 * A reader for RSS 2.0 and Atom written by hand rather than an XML library.
 * Three fields are wanted per entry — title, link, date — from nine feeds whose
 * markup is known and fixture-tested, and the library that would do it pulled
 * eight packages into a job that holds write access to the repository.
 */

export interface FeedSpec {
  /** Short name for logs. */
  id: string;
  url: string;
  /** Display name, shown under every headline from this feed. */
  source: string;
  /** A fixed group, or 'auto': fuel words send it to Paliwa i gaz, the rest to Energetyka. */
  group: NewsGroupId | 'auto';
  /**
   * The feed is a general business section with energy in it (wnp.pl
   * "Energia" carried the dollar, metals and Canadian mining on 17.09.2026 —
   * five of eight entries). Only titles with an industry word are kept.
   */
  topical?: boolean;
}

export interface FeedEntry {
  title: string;
  url: string;
  publishedAt: Date | null;
}

/* ------------------------------------------------------------------ reading */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  oacute: 'ó', Oacute: 'Ó',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name] ?? whole;
  });
}

const escapeTag = (tag: string) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`, 'g');
  return Array.from(xml.matchAll(pattern), (match) => match[1]);
}

/** Text of the first `<tag>` in `block`: CDATA unwrapped, entities decoded, markup dropped. */
function text(block: string, tag: string): string | null {
  const found = blocks(block, tag)[0];
  if (found === undefined) return null;
  const unwrapped = found.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(tagSource: string, name: string): string | null {
  const match = tagSource.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeEntities(match[2] ?? match[3] ?? '') : null;
}

/** Atom: the `alternate` link, or the first link with no `rel` at all. */
function atomLink(block: string): string | null {
  const links = Array.from(block.matchAll(/<link\b([^>]*)\/?>/gi), (match) => match[1]);
  const pick =
    links.find((attrs) => attribute(attrs, 'rel') === 'alternate') ??
    links.find((attrs) => attribute(attrs, 'rel') === null);
  return pick ? attribute(pick, 'href') : null;
}

export function parseFeed(xml: string): FeedEntry[] {
  const atom = /<entry[\s>]/.test(xml);
  const entries = atom ? blocks(xml, 'entry') : blocks(xml, 'item');
  return entries.map((block) => {
    const url = atom ? atomLink(block) : text(block, 'link');
    const when = atom
      ? text(block, 'published') ?? text(block, 'updated') ?? text(block, 'dc:date')
      : text(block, 'pubDate') ?? text(block, 'dc:date');
    return {
      title: text(block, 'title') ?? '',
      url: (url ?? '').trim(),
      publishedAt: when ? parseFeedDate(when) : null,
    };
  });
}

/* -------------------------------------------------------------------- dates */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const warsawParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Warsaw',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Warsaw's offset from UTC, in ms, at the instant `t`. */
function warsawOffset(t: number): number {
  const parts = Object.fromEntries(warsawParts.formatToParts(new Date(t)).map((part) => [part.type, part.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wall - Math.floor(t / 1000) * 1000;
}

/** A wall-clock time in Warsaw, as an instant. Checked twice so a DST boundary does not land an hour out. */
export function warsawWallTime(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  const guess = Date.UTC(year, month, day, hour, minute, second);
  const first = guess - warsawOffset(guess);
  return new Date(guess - warsawOffset(first));
}

/**
 * RFC 822 (RSS) or ISO 8601 (Atom). A date with no zone is read as Warsaw time:
 * wnp.pl writes "Thu, 17 Sep 2026 18:06:44" and means 18:06 in Poland.
 */
export function parseFeedDate(value: string): Date | null {
  const trimmed = value.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (iso) {
    if (iso[7]) {
      const parsed = Date.parse(trimmed.replace(' ', 'T'));
      return Number.isNaN(parsed) ? null : new Date(parsed);
    }
    return warsawWallTime(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0));
  }

  const rfc = trimmed.match(/^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*(\S+)?$/i);
  if (rfc) {
    const month = MONTHS[rfc[2].toLowerCase()];
    if (month === undefined) return null;
    if (rfc[7]) {
      const parsed = Date.parse(trimmed);
      return Number.isNaN(parsed) ? null : new Date(parsed);
    }
    return warsawWallTime(+rfc[3], month, +rfc[1], +rfc[4], +rfc[5], +(rfc[6] ?? 0));
  }

  return null;
}

/* -------------------------------------------------------------------- rules */

/**
 * Energy, power, fuels and the companies and institutions behind them. Stems, so
 * Polish inflection matches. A lookahead rather than a trailing \b after "ropą":
 * without the u flag \b treats ą as a non-word character.
 */
const INDUSTRY =
  /energ|prąd|elektr|\bsie[ćc]|\bsieci|\boze\b|fotowolt|wiatr|atom|jądrow|węgl|kopal|ciepł|paliw|\brop(?:a|y|ie|ą)(?![a-ząćęłńóśźż])|\bgaz|\blng\b|orlen|\bpge\b|tauron|\benea\b|\benerga\b|rafiner|benzyn|diesel|unimot|\bure\b|\bpse\b|wod[óo]r|biometan|emisj|taryf|rurocią|gazocią/i;

/** Sends an 'auto' headline to Paliwa i gaz. */
const FUEL = /paliw|\brop(?:a|y|ie|ą)(?![a-ząćęłńóśźż])|\bgaz|\blng\b|orlen|rafiner|benzyn|diesel|unimot|rurocią|gazocią/i;

/** Days a headline stays on the list. Regulacje is sparse — eight items there reach back two weeks. */
const WINDOW_DAYS: Record<NewsGroupId, number> = { sieci: 3, regulacje: 14, energetyka: 3, paliwa: 3 };

export const MAX_ITEMS_PER_GROUP = 8;

/**
 * "Komunikat" alone says nothing a reader could decide on; URE titles two of
 * its notices exactly that. A trailing full stop goes too — a headline is not
 * a sentence, and PSE ends some of theirs with one — but not after a short
 * word, where it closes an abbreviation: "w 2025 r.", "25 mld zł.".
 */
export function cleanTitle(title: string): string | null {
  const cleaned = title
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s(])(\S+?)\.$/, (whole, before: string, word: string) =>
      !word.endsWith('.') && (/^\d+$/.test(word.replace(/[.\-/]/g, '')) || word.length >= 4)
        ? `${before}${word}`
        : whole
    )
    .trim();
  if (cleaned === '' || /^komunikat$/i.test(cleaned)) return null;
  return cleaned;
}

export function groupFor(spec: FeedSpec, title: string): NewsGroupId | null {
  if (spec.topical && !INDUSTRY.test(title)) return null;
  if (spec.group !== 'auto') return spec.group;
  return FUEL.test(title) ? 'paliwa' : 'energetyka';
}

/** The same article reached through two feeds or with tracking parameters on it. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (key.toLowerCase().startsWith('utm_')) parsed.searchParams.delete(key);
    }
    parsed.hash = '';
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

const normalizeTitle = (title: string) => title.toLowerCase().replace(/[\s.,:;!?–—-]+/g, ' ').trim();

/** FNV-1a, 32 bits, hex. Enough to tell forty headlines apart, and needs nothing from Node. */
export function hashId(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface FeedResult {
  spec: FeedSpec;
  entries: FeedEntry[];
}

/**
 * Every feed's entries into one file.
 *
 * Feeds are taken in the order given, and a duplicate keeps the group it was
 * first found in — so a Wysokie Napięcie article in both its Sieci category
 * feed and its main feed stays under Sieci when that feed is listed first. It
 * does take the newer date and text, which is how PSE's notice for 22.09,
 * published twice, collapses into its later copy.
 */
export function buildNewsFile(results: FeedResult[], now: Date): NewsFile {
  type Entry = { group: NewsGroupId; item: NewsItem };
  const byUrl = new Map<string, Entry>();
  const byTitle = new Map<string, Entry>();
  const kept: Entry[] = [];
  // A minute of slack for clocks; anything later is an event announcement, not news.
  const latest = now.getTime() + 60 * 1000;

  for (const { spec, entries } of results) {
    for (const entry of entries) {
      if (!entry.publishedAt || !isHttpsUrl(entry.url)) continue;
      const title = cleanTitle(entry.title);
      if (!title) continue;
      const group = groupFor(spec, title);
      if (!group) continue;
      const time = entry.publishedAt.getTime();
      if (time > latest || now.getTime() - time > WINDOW_DAYS[group] * 24 * 60 * 60 * 1000) continue;

      const urlKey = normalizeUrl(entry.url);
      const titleKey = normalizeTitle(title);
      const item: NewsItem = {
        id: hashId(urlKey),
        title,
        url: entry.url,
        source: spec.source,
        publishedAt: entry.publishedAt.toISOString(),
      };

      const existing = byUrl.get(urlKey) ?? byTitle.get(titleKey);
      if (existing) {
        if (Date.parse(item.publishedAt) > Date.parse(existing.item.publishedAt)) existing.item = item;
        byUrl.set(urlKey, existing);
        byTitle.set(titleKey, existing);
        continue;
      }
      const fresh = { group, item };
      kept.push(fresh);
      byUrl.set(urlKey, fresh);
      byTitle.set(titleKey, fresh);
    }
  }

  return {
    generatedAt: now.toISOString(),
    groups: NEWS_GROUPS.map(({ id, label }) => ({
      id,
      label,
      items: kept
        .filter((entry) => entry.group === id)
        .map((entry) => entry.item)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .slice(0, MAX_ITEMS_PER_GROUP),
    })),
  };
}
