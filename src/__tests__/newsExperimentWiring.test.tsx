import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import app from '../App.tsx?raw';
import header from '../components/Header.tsx?raw';
// Renders with the stand-in for the service worker's registration hook
// (src/test/pwaRegister.ts, aliased in vitest.config.ts).
import App from '../App';

/**
 * The promise of the experiment is that without ?z-branzy= the phone is
 * exactly what it was. The visual guard shows it in pictures; this pins it in
 * the source (one decision, three gated renders) and in a render of the whole
 * App, with a positive control for each variant so "none of them rendered"
 * cannot pass merely because nothing could.
 */
describe('news experiment wiring in App — source', () => {
  it('decides in one place', () => {
    expect(app.match(/useNewsExperiment\(\)/g)).toHaveLength(1);
    expect(app).toContain('const wariant = useNewsExperiment();');
  });

  it('renders each variant only behind its own name, and each exactly once', () => {
    expect(app).toContain("newsButton={wariant === 'pasek' && newsEntry ? <PasekIkona {...newsEntry} /> : undefined}");
    expect(app).toContain("{wariant === 'gora' && newsEntry && <SekcjaGora {...newsEntry} />}");
    expect(app).toContain("{wariant === 'dol' && newsEntry && <PasekDolny {...newsEntry} />}");
    for (const tag of ['<PasekIkona', '<SekcjaGora', '<PasekDolny']) {
      expect(app.split(tag)).toHaveLength(2);
    }
    // The sheet belongs to the two entries that open it, not to App.
    expect(app).not.toContain('ArkuszTelefon');
  });

  it('shows the variants under the same rule as the desktop card', () => {
    expect(app).toMatch(/const newsEntry: WejscieProps \| null =\s*news && newsState !== 'expired'/);
  });

  it('gives the icon a place in the header only when App hands one over', () => {
    expect(header).toContain('newsButton?: React.ReactNode;');
    expect(header).toMatch(/\{newsButton\}\s*<button\s+type="button"\s+onClick=\{onToggleSettings\}/);
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

describe('news experiment wiring in App — render', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    openAt('');
    // Only the headlines answer; every other source is down, which App
    // already has to stand (the no-data scene). Stamped a moment ago, so the
    // file is fresh and every variant has something to show.
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

  const experiment = () => ({
    icon: document.querySelector('header [data-z-branzy-otworz]'),
    bar: document.querySelector('.zb-bar'),
    room: document.querySelector('[data-z-branzy-odstep]'),
    section: document.querySelector('[data-z-branzy-sekcja]'),
  });

  /** The desktop card is in the tree on every width (CSS hides it), so it says the file has landed. */
  const newsLanded = () => waitFor(() => expect(screen.getByRole('button', { name: 'Wszystkie ›' })).toBeInTheDocument());

  it('without the parameter renders none of the three', async () => {
    render(<App />);
    await newsLanded();

    expect(experiment()).toEqual({ icon: null, bar: null, room: null, section: null });
  });

  it('with ?z-branzy=pasek: the icon in the header, and nothing else', async () => {
    openAt('?z-branzy=pasek');
    render(<App />);
    await newsLanded();

    const found = experiment();
    expect(found.icon).toHaveAccessibleName('Z branży');
    expect([found.bar, found.room, found.section]).toEqual([null, null, null]);
  });

  it('with ?z-branzy=dol: the bar and the room for it, and nothing else', async () => {
    openAt('?z-branzy=dol');
    render(<App />);
    await newsLanded();

    const found = experiment();
    expect(found.bar).not.toBeNull();
    expect(found.room).not.toBeNull();
    expect([found.icon, found.section]).toEqual([null, null]);
  });

  it('with ?z-branzy=gora: the section, and nothing else', async () => {
    openAt('?z-branzy=gora');
    render(<App />);
    await newsLanded();

    const found = experiment();
    expect(found.section).not.toBeNull();
    expect([found.icon, found.bar, found.room]).toEqual([null, null, null]);
  });

  it('with ?z-branzy=brak, and on a window from 48rem whatever the parameter: none', async () => {
    openAt('?z-branzy=brak');
    const first = render(<App />);
    await newsLanded();
    expect(experiment()).toEqual({ icon: null, bar: null, room: null, section: null });
    first.unmount();

    const restore = mockMedia(['(min-width: 48rem)']);
    try {
      openAt('?z-branzy=gora');
      render(<App />);
      await newsLanded();
      expect(experiment()).toEqual({ icon: null, bar: null, room: null, section: null });
    } finally {
      restore();
    }
  });
});
