import { describe, it, expect } from 'vitest';
import app from '../App.tsx?raw';
import workflow from '../../.github/workflows/summary.yml?raw';
import viteConfig from '../../vite.config.ts?raw';

/**
 * Source-level, like settingsWiring.test.ts: App has no render harness, and the
 * workflow and the service-worker config have none at all. What the card and the
 * panel do with these props is tested on the components themselves.
 */
describe('news wiring in App', () => {
  it('shows the card only while the file is young enough, and hands it the reader\'s clock', () => {
    expect(app).toContain("const newsState = news ? newsFreshness(news, now) : 'expired';");
    expect(app).toMatch(/\{news && newsState !== 'expired' && \(\s*<NewsCard/);
    expect(app).toContain("stale={newsState === 'stale'}");
  });

  it('lists four headlines from 110rem and two below it', () => {
    expect(app).toContain("const newsWide = useMediaQuery('(min-width: 110rem)');");
    expect(app).toContain("variant={newsWide ? 'monitor' : 'laptop'}");
  });

  it('keeps one panel on the right: opening the news closes the settings, and the gear closes the news', () => {
    expect(app).toMatch(/const openNews = useCallback\(\(itemId: string \| null\) => \{\s*setSettingsVisible\(false\);/);
    expect(app).toMatch(/if \(settingsVisible && newsOpen\) closeNews\(\);/);
  });

  it('marks the headlines as seen when the panel closes, and an article as read when it is opened', () => {
    expect(app).toMatch(/const closeNews = useCallback\(\(\) => \{[\s\S]*markNewsSeen\(\);/);
    expect(app).toContain('onArticleOpen={markNewsRead}');
  });

  it('refreshes the headlines along with everything else', () => {
    expect(app).toMatch(/const refreshAll = useCallback\(async \(\) => \{[\s\S]*refreshNews\(\);/);
  });
});

describe('news.json in the publish step', () => {
  it('is checked, committed and counted as a reason to deploy', () => {
    expect(workflow).toContain('news_changed=$([ -n "$(git status --porcelain -- public/news.json)" ] && echo yes || echo no)');
    expect(workflow).toContain('if [ -f public/news.json ]; then git add public/news.json; fi');
    expect(workflow).toMatch(/if \[ "\$summary_changed" = yes \] \|\| \[ "\$prices_changed" = yes \] \|\| \[ "\$news_changed" = yes \]/);
  });

  it('is named in the commit message, without losing the wording of the other two', () => {
    expect(workflow).toContain('czesci="${czesci:+$czesci, }wiadomosci"');
    expect(workflow).toContain('wiadomosc="Zapisz przebieg podsumowania"');
  });

  it('has a cache of its own in the service worker, so the three files cannot evict each other', () => {
    expect(viteConfig).toContain("cacheName: 'news-cache'");
    expect(viteConfig).toMatch(/urlPattern: \/\\\/news\\\.json\$\//);
  });
});
