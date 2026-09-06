import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import Badanie, { BADANIE_URL } from '../Badanie';
import { BadanieFile } from '../../utils/badanieTypes';

/**
 * One day of each shape the table has to tell apart at a glance: a hit (event
 * on record, all four features extreme), a quiet day (nothing on either
 * side), and a day whose decision window has not closed yet.
 */
const FIXTURE: BadanieFile = {
  generatedAt: '2026-09-05T06:00:00Z',
  noticeHours: 8,
  exemptionMw: 1100,
  dwellFloorMw: 1500,
  alarmFrom: 3,
  days: [
    {
      date: '2026-09-02',
      window: { readAt: '2026-09-02T10:00:00Z', deadline: '2026-09-02T10:00:00Z', open: false },
      worstHour: 20,
      surplus: 900,
      required: 2000,
      margin: -1100,
      headroom: { value: -200, percentile: 0.95, extreme: true },
      dwell: { value: 5, percentile: 0.92, extreme: true },
      eveMargin: { value: -300, percentile: 0.91, extreme: true },
      compass: { level: 3, extreme: true },
      extremeCount: 4,
      event: { date: '2026-09-02', hour: 20, kind: 'test', scope: 'unit', note: 'jedna jednostka wyłączona' },
      observation: null,
      verdict: 'trafienie',
      readings: [
        ['2026-09-02T08:00:00Z', 950, 2000],
        ['2026-09-02T10:00:00Z', 900, 2000],
      ],
    },
    {
      date: '2026-09-03',
      window: { readAt: '2026-09-03T10:00:00Z', deadline: '2026-09-03T10:00:00Z', open: false },
      worstHour: 21,
      surplus: 3000,
      required: 2000,
      margin: 1000,
      headroom: { value: 1900, percentile: 0.2, extreme: false },
      dwell: { value: 0, percentile: 0.1, extreme: false },
      eveMargin: { value: 800, percentile: 0.15, extreme: false },
      compass: { level: 0, extreme: false },
      extremeCount: 0,
      event: null,
      observation: null,
      verdict: 'cisza',
      readings: [['2026-09-03T10:00:00Z', 3000, 2000]],
    },
    {
      date: '2026-09-04',
      window: { readAt: '2026-09-04T08:00:00Z', deadline: null, open: true },
      worstHour: 20,
      surplus: 2500,
      required: 2000,
      margin: 500,
      headroom: { value: 1400, percentile: 0.3, extreme: false },
      dwell: { value: 1, percentile: 0.2, extreme: false },
      eveMargin: { value: null, percentile: null, extreme: false },
      compass: { level: null, extreme: false },
      extremeCount: 0,
      event: null,
      observation: null,
      verdict: 'otwarte',
      readings: [['2026-09-04T08:00:00Z', 2500, 2000]],
    },
  ],
  observations: [],
  events: [
    { date: '2026-09-02', hour: 20, kind: 'test', scope: 'unit', note: 'jedna jednostka wyłączona' },
  ],
};

function respondWith(value: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => value }));
}

describe('Badanie', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the pinned URL, uncached', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);

    await screen.findByText('Badanie przywołań');

    expect(fetch).toHaveBeenCalledWith(BADANIE_URL, { cache: 'no-store' });
    // Pinned literally, not just "some raw.githubusercontent URL" — a branch
    // or repo typo here would point the page at nothing and still "pass" a
    // looser check.
    expect(BADANIE_URL).toBe(
      'https://raw.githubusercontent.com/bartorux/dashboard-iphone/react/data/badanie.json'
    );
  });

  it('shows the header and the running commentary', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);

    expect(await screen.findByText('Badanie przywołań')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Strona robocza. Nic z tego nie trafia na ekran główny, dopóki reguła nie sprawdzi się na kolejnych zdarzeniach.'
      )
    ).toBeInTheDocument();
  });

  it('marks the day with an event as a hit, naming the event kind', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('02.09').closest('tr')!;
    expect(within(row).getByText('trafienie')).toBeInTheDocument();
    expect(within(row).getByText('test, jedna jednostka')).toBeInTheDocument();
    // The event row is bold — the one visual distinction this "may look like
    // garbage" page still has to make.
    expect(row.className).toContain('font-semibold');
  });

  it('paints an extreme feature cell in the alarm colours', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('02.09').closest('tr')!;
    // Headroom's value, -200 MW, formatted with its sign — signedMW uses the
    // ASCII hyphen Intl's pl-PL formatter produces, not a typographic minus.
    const cell = within(row).getByText('-200 MW').closest('td')!;
    expect(cell.className).toContain('bg-alarm-soft');
    expect(cell.className).toContain('text-alarm-text');
  });

  it('shows each day its own target hour, not a fixed one', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');
    // The quiet day in the fixture is scored on 21:00; a column that always
    // said 20:00 would pass every other test here and still be wrong. Scoped
    // to that day's row, because a reading time elsewhere can also be 21:00.
    const row = screen.getByRole('button', { name: '03.09' }).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('21:00')).toBeInTheDocument();
  });

  it('groups days: ahead first, settled notable next, quiet ones behind a fold', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');
    const tableOf = (caption: RegExp) =>
      screen.getByRole('table', { name: caption }) as HTMLElement;
    // The open day (04.09) is the only row in the "ahead" table.
    expect(within(tableOf(/jeszcze nie minął/)).getByRole('button', { name: '04.09' })).toBeInTheDocument();
    expect(within(tableOf(/jeszcze nie minął/)).queryByRole('button', { name: '02.09' })).toBeNull();
    // The event day (02.09) is notable; the quiet day (03.09) is not.
    expect(within(tableOf(/ze zdarzeniem/)).getByRole('button', { name: '02.09' })).toBeInTheDocument();
    expect(within(tableOf(/ze zdarzeniem/)).queryByRole('button', { name: '03.09' })).toBeNull();
    // Quiet days live inside a collapsed <details>, counted in its summary.
    const fold = screen.getByText(/Cisza — 1 doba/).closest('details');
    expect(fold).not.toBeNull();
    expect(fold).not.toHaveAttribute('open');
    expect(within(fold as HTMLElement).getByRole('button', { name: '03.09' })).toBeInTheDocument();
  });

  it('explains a column at once on hover and pins it on click', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');
    // The first table's header buttons; every table has its own hint line.
    const dwell = screen.getAllByRole('button', { name: 'Dwell' })[0];
    const status = () => screen.getAllByRole('status')[0];
    expect(status().textContent).toMatch(/Najedź na nagłówek/);
    // Hover: shown immediately, no browser tooltip delay involved.
    fireEvent.mouseEnter(dwell);
    expect(status().textContent).toMatch(/kolejnych odczytów/);
    fireEvent.mouseLeave(dwell);
    expect(status().textContent).toMatch(/Najedź na nagłówek/);
    // Click pins it — the only gesture a phone has.
    fireEvent.click(dwell);
    expect(dwell).toHaveAttribute('aria-pressed', 'true');
    expect(status().textContent).toMatch(/kolejnych odczytów/);
    // With one column pinned, hovering another wins for as long as the
    // pointer stays there, then the pinned one comes back.
    const zapas = screen.getAllByRole('button', { name: 'Zapas' })[0];
    fireEvent.mouseEnter(zapas);
    expect(status().textContent).toMatch(/nad progiem/);
    fireEvent.mouseLeave(zapas);
    expect(status().textContent).toMatch(/kolejnych odczytów/);
    fireEvent.click(dwell);
    expect(status().textContent).toMatch(/Najedź na nagłówek/);
    // Every feature column has something to say.
    for (const label of ['Zapas', 'D−1 wiecz.', 'Kompas', 'Ekstrema', 'Werdykt']) {
      expect(screen.getAllByRole('button', { name: label })[0]).toBeInTheDocument();
    }
  });

  it('leaves a quiet day unmarked', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('03.09').closest('tr')!;
    expect(within(row).getByText('cisza')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument(); // no event
    expect(row.className).not.toContain('font-semibold');
    expect(row.querySelector('.bg-alarm-soft')).toBeNull();
  });

  it('expands a day to its readings, marking the window reading', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const button = screen.getByRole('button', { name: '02.09' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const detailsId = button.getAttribute('aria-controls')!;

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // Scoped by aria-controls rather than screen.findByRole('list'): the
    // footer's event register is its own <ul>, also role "list".
    const details = document.getElementById(detailsId)!;
    const list = within(details).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    // Second reading (10:00Z = window.readAt) is the window: bold and labelled.
    const windowItem = items[1];
    expect(windowItem.textContent).toContain('(okno)');
    expect(windowItem.className).toContain('font-semibold');
    // Both readings sit below the 1500 MW dwell floor.
    expect(items[0].className).toContain('text-warn-text');
    expect(items[1].className).toContain('text-warn-text');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(detailsId)).toBeNull();
  });

  it('marks an open day as open instead of showing a window time', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('04.09').closest('tr')!;
    // Both the "Okno" cell and the "Werdykt" cell say "otwarte" here.
    expect(within(row).getAllByText('otwarte')).toHaveLength(2);
    // Muted, not bold — no event, and the day itself is still open.
    expect(row.className).toContain('text-text-secondary');
  });

  it('shows an error rather than throwing when the fetch is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<Badanie />);

    expect(
      await screen.findByText('Brak danych badania — nie udało się pobrać pliku.')
    ).toBeInTheDocument();
  });

  it('shows an error when the server responds but not ok', async () => {
    respondWith(null, false);
    render(<Badanie />);

    expect(
      await screen.findByText('Brak danych badania — nie udało się pobrać pliku.')
    ).toBeInTheDocument();
  });

  it('lists the event register in the footer', async () => {
    respondWith(FIXTURE);
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const footer = screen.getByText('Rejestr zdarzeń').closest('footer')!;
    const entry = within(footer).getByRole('listitem');
    expect(entry.textContent).toBe(
      '02.09 20:00 — test, jedna jednostka: jedna jednostka wyłączona'
    );
  });
});
