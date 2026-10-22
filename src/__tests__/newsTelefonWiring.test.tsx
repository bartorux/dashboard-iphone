import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import app from '../App.tsx?raw';
import header from '../components/Header.tsx?raw';
// Renders with the stand-in for the service worker's registration hook
// (src/test/pwaRegister.ts, aliased in vitest.config.ts).
import App from '../App';

/**
 * "Z branży" on a phone is one row under the AI summary — kept 22.10.2026
 * after a week's trial, the other three ways in removed. Pinned in the source
 * (one gate, one render, nothing left of the experiment) and in a render of
 * the whole App on both sides of the 48rem line.
 */
describe('"Z branży" on a phone — source', () => {
  it('renders the row once, behind the phone check and the desktop card\'s own rule', () => {
    expect(app).toContain("const telefon = !useMediaQuery('(min-width: 48rem)');");
    expect(app).toContain('{telefon && newsEntry && <WierszZBranzy {...newsEntry} />}');
    expect(app.split('<WierszZBranzy')).toHaveLength(2);
    expect(app).toMatch(/const newsEntry: WejscieProps \| null =\s*news && newsState !== 'expired'/);
    // The sheet belongs to the row that opens it, not to App.
    expect(app).not.toContain('ArkuszTelefon');
  });

  it('puts the row straight under the AI summary, above the day tabs', () => {
    const summary = app.indexOf('<SummaryCard');
    const row = app.indexOf('<WierszZBranzy');
    expect(summary).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(summary);
    expect(app.indexOf('<NewsCard')).toBeGreaterThan(row);
    expect(app.indexOf('<DayNavigation')).toBeGreaterThan(row);
  });

  it('keeps nothing of the experiment: no variants, no parameter, no slot in the header', () => {
    for (const gone of ['useNewsExperiment', 'PasekIkona', 'PasekDolny', 'SekcjaGora', 'z-branzy', 'eksperyment']) {
      expect(app).not.toContain(gone);
    }
    expect(header).not.toContain('newsButton');
  });
});

const openAt = (search: string) => window.history.replaceState(null, '', `/${search}`);

/** Replaces the setup's matchMedia so the 48rem line can be crossed. */
function mockMedia(matching: string[]) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('"Z branży" on a phone — render', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    openAt('');
    // Only the headlines answer; every other source is down, which App
    // already has to stand (the no-data scene). Stamped a moment ago, so the
    // file is fresh and the row has something to show.
    const file = {
      generatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      groups: [
        {
          id: 'sieci',
          label: 'Sieci',
          items: [
            {
              id: 's1',
              title: 'Komunikat OSP',
              url: 'https://x.pl/s1',
              source: 'PSE',
              publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            },
          ],
        },
        { id: 'regulacje', label: 'Regulacje', items: [] },
        { id: 'energetyka', label: 'Energetyka', items: [] },
        { id: 'paliwa', label: 'Paliwa i gaz', items: [] },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith('news.json')
          ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(file) })
          : Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    openAt('');
  });

  const row = () => document.querySelector('[aria-label^="Z branży, "]');

  /** The desktop card is in the tree on every width (CSS hides it), so it says the file has landed. */
  const newsLanded = () => waitFor(() => expect(screen.getByRole('button', { name: 'Wszystkie ›' })).toBeInTheDocument());

  it('shows the row on a phone, outside the header', async () => {
    render(<App />);
    await newsLanded();

    // A first visit has seen nothing yet, so nothing counts as new: the time of the feeds.
    expect(row()).toHaveAccessibleName(/^Z branży, stan \d{2}:\d{2}$/);
    expect(row()?.closest('header')).toBeNull();
  });

  it('shows it whatever an old ?z-branzy= address still says — the parameter is gone', async () => {
    for (const search of ['?z-branzy=brak', '?z-branzy=pasek']) {
      sessionStorage.setItem('pse-dashboard-z-branzy', 'brak');
      openAt(search);
      const view = render(<App />);
      await newsLanded();
      expect(row()).not.toBeNull();
      expect(document.querySelector('header [data-z-branzy-otworz]')).toBeNull();
      view.unmount();
    }
  });

  it('shows nothing from 48rem up', async () => {
    const restore = mockMedia(['(min-width: 48rem)']);
    try {
      render(<App />);
      await newsLanded();
      expect(row()).toBeNull();
    } finally {
      restore();
    }
  });
});
