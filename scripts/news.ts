/**
 * Reads the industry feeds behind the "Z branży" card.
 *
 *   npx tsx scripts/news.ts --print    # read every feed, print the file, write nothing
 *
 * Imported by scripts/summary.ts, which writes public/news.json on its own
 * schedule; run directly, it only prints. Every feed is optional: one that
 * times out or changes its markup costs its own headlines, never the file.
 */
import { pathToFileURL } from 'node:url';
import { buildNewsFile, parseFeed } from '../src/utils/newsFeed';
import type { FeedResult, FeedSpec } from '../src/utils/newsFeed';
import type { NewsFile } from '../src/utils/newsTypes';

/**
 * Checked by hand on 17.09.2026: each answered 200 with entries from that day
 * or week. Order matters — a duplicate keeps the group of the feed listed
 * first (see buildNewsFile), so the category feeds come before the general
 * ones they overlap with.
 *
 * Left out on purpose: BiznesAlert and Rynek Infrastruktury (robots.txt shuts
 * automated readers out), TGE, PAP and e-petrol (no public feed, or a bot
 * wall), URE's feeds 424 and 497 (the whole archive back to 1998, 1.5 MB).
 */
const PSE_FEED = (publisher: string) =>
  `https://www.pse.pl/home/-/asset_publisher/${publisher}/rss?safeargs=705f705f63616368656162696c6974793d63616368654c6576656c46756c6c`;

export const FEEDS: FeedSpec[] = [
  { id: 'pse-osp', url: PSE_FEED('sBY9fi0vULd2'), source: 'PSE', group: 'sieci' },
  { id: 'wnn-sieci', url: 'https://wysokienapiecie.pl/kategoria/sieci/feed/', source: 'Wysokie Napięcie', group: 'sieci' },
  { id: 'ure', url: 'https://www.ure.gov.pl/dokumenty/rss/9-rss-o-96.rss', source: 'URE', group: 'regulacje' },
  { id: 'pse-aktualnosci', url: PSE_FEED('SYKTI8bIXUBw'), source: 'PSE', group: 'regulacje' },
  { id: 'cire-gaz', url: 'https://www.cire.pl/rss/gazownictwo.xml', source: 'CIRE', group: 'paliwa' },
  { id: 'cire', url: 'https://www.cire.pl/rss/energetyka.xml', source: 'CIRE', group: 'energetyka' },
  { id: 'wnn', url: 'https://wysokienapiecie.pl/feed/', source: 'Wysokie Napięcie', group: 'energetyka' },
  { id: 'energetyka24', url: 'https://energetyka24.com/_rss', source: 'Energetyka24', group: 'auto', topical: true },
  { id: 'wnp', url: 'https://www.wnp.pl/rss/energia_rss.xml', source: 'wnp.pl', group: 'auto', topical: true },
];

const FEED_TIMEOUT_MS = 15_000;

/**
 * A browser-like User-Agent: several of these sites answer a bare client with a
 * bot page rather than the feed. Named honestly after the dashboard all the
 * same, with a link back, so an operator reading their logs knows who it is.
 */
const USER_AGENT =
  'Mozilla/5.0 (compatible; pse-dashboard-news/1.0; +https://github.com/bartorux/dashboard-iphone)';

async function readFeed(spec: FeedSpec): Promise<FeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(spec.url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!response.ok) {
      console.warn(`Wiadomosci: ${spec.id} odpowiedzial ${response.status} — pomijam.`);
      return { spec, entries: [] };
    }
    const entries = parseFeed(await response.text());
    if (entries.length === 0) console.warn(`Wiadomosci: ${spec.id} bez wpisow — zmienil sie format?`);
    return { spec, entries };
  } catch (error) {
    console.warn(`Wiadomosci: ${spec.id} nieczytelny — ${String(error)}.`);
    return { spec, entries: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Every feed at once; each failure is logged and costs only that feed. */
export async function collectNews(now: Date): Promise<NewsFile> {
  const results = await Promise.all(FEEDS.map(readFeed));
  return buildNewsFile(results, now);
}

/**
 * Run directly: print, never write. Wrapped in a function rather than awaited
 * at the top level, so importing this file cannot force the importer to be a
 * module with a top-level await of its own.
 */
async function main(): Promise<void> {
  const file = await collectNews(new Date());
  if (process.argv.includes('--print')) {
    for (const group of file.groups) {
      console.log(`\n${group.label} (${group.items.length})`);
      for (const item of group.items) {
        console.log(`  ${item.publishedAt.slice(0, 16)}  ${item.source.padEnd(16)}  ${item.title}`);
      }
    }
  } else {
    console.log(JSON.stringify(file, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
