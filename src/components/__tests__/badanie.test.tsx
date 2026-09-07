import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import Badanie, { BADANIE_URL, ISSUES_URL, defaultDraftFor, defaultHourFor } from '../Badanie';
import { BadanieFile } from '../../utils/badanieTypes';
import { signedMW } from '../../utils/format';

/**
 * One day of each shape the table has to tell apart at a glance: a hit (event
 * on record, all four features extreme, register-sourced observation that
 * mirrors it), a day with an issue-sourced test/real observation and no
 * register event at all, a quiet day with an issue-sourced "nothing
 * happened" observation, a quiet day with no entry at all, and a day whose
 * decision window has not closed yet.
 */
const FIXTURE: BadanieFile = {
  generatedAt: '2026-09-05T06:00:00Z',
  noticeHours: 8,
  exemptionMw: 1100,
  dwellFloorMw: 1500,
  alarmFrom: 3,
  days: [
    {
      date: '2026-08-31',
      window: { readAt: '2026-08-31T09:00:00Z', deadline: '2026-08-31T09:00:00Z', open: false },
      worstHour: 19,
      surplus: 3100,
      required: 2000,
      margin: 1100,
      headroom: { value: 2000, percentile: 0.15, extreme: false },
      dwell: { value: 0, percentile: 0.05, extreme: false },
      eveMargin: { value: 700, percentile: 0.1, extreme: false },
      compass: { level: 0, extreme: false, hours: [] },
      extremeCount: 0,
      tightHours: [],
      // No register event at all: the ONLY record of this call period is the
      // Issue below. Distinct from 02.09, whose observation just mirrors an
      // event already in the register.
      event: null,
      observation: {
        date: '2026-08-31',
        outcome: 'real',
        hour: 19,
        scope: 'market',
        source: 'issue',
        issueNumber: 9,
      },
      verdict: 'cisza',
      readings: [['2026-08-31T09:00:00Z', 3100, 2000]],
      // A closed day from the past — never part of the current forecast.
      exchangePlanned: null,
    },
    {
      date: '2026-09-01',
      window: { readAt: '2026-09-01T10:00:00Z', deadline: '2026-09-01T10:00:00Z', open: false },
      worstHour: 20,
      surplus: 3200,
      required: 2000,
      margin: 1200,
      headroom: { value: 2100, percentile: 0.1, extreme: false },
      dwell: { value: 0, percentile: 0.05, extreme: false },
      eveMargin: { value: 900, percentile: 0.1, extreme: false },
      compass: { level: 0, extreme: false, hours: [] },
      extremeCount: 0,
      tightHours: [],
      event: null,
      // Filed through Issues, already folded into `observations` below —
      // this is the case the "czeka na przeliczenie" list must NOT show.
      observation: { date: '2026-09-01', outcome: 'none', source: 'issue', issueNumber: 3 },
      verdict: 'cisza',
      readings: [['2026-09-01T10:00:00Z', 3200, 2000]],
      exchangePlanned: null,
    },
    {
      date: '2026-09-02',
      window: { readAt: '2026-09-02T10:00:00Z', deadline: '2026-09-02T10:00:00Z', open: false },
      worstHour: 20,
      surplus: 900,
      required: 2000,
      margin: -1100,
      headroom: { value: -200, percentile: 0.95, extreme: true },
      // Hours, not a reading count, since the dwell change — see badanie.ts.
      dwell: { value: 17.5, percentile: 0.92, extreme: true },
      eveMargin: { value: -300, percentile: 0.91, extreme: true },
      // Real 04.08/06.08 shape: the L2+ hour(s) need not be the target hour
      // (20) itself — here hour 19, one of the day's other tight hours.
      compass: { level: 3, extreme: true, hours: [19] },
      extremeCount: 4,
      // Two other hours also looked tight the same day — the example the
      // component's own doc comment quotes.
      tightHours: [
        { hour: 18, surplus: 1700, margin: -300 },
        { hour: 21, surplus: 1880, margin: -120 },
      ],
      event: { date: '2026-09-02', hour: 20, kind: 'test', scope: 'unit', note: 'jedna jednostka wyłączona' },
      // Register-sourced: mirrors `event` above and must not print twice.
      observation: {
        date: '2026-09-02',
        outcome: 'test',
        hour: 20,
        scope: 'unit',
        note: 'jedna jednostka wyłączona',
        source: 'register',
      },
      verdict: 'trafienie',
      // Exchange carried on both readings, changing between them — exercises
      // the "(zmiana salda)" marker in ReadingsList.
      readings: [
        ['2026-09-02T08:00:00Z', 950, 2000, -800],
        ['2026-09-02T10:00:00Z', 900, 2000, -1200],
      ],
      exchangePlanned: null,
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
      compass: { level: 0, extreme: false, hours: [] },
      extremeCount: 0,
      tightHours: [],
      event: null,
      // The one closed day with no entry yet — the record form's default.
      observation: null,
      verdict: 'cisza',
      readings: [['2026-09-03T10:00:00Z', 3000, 2000]],
      exchangePlanned: null,
    },
    {
      date: '2026-09-04',
      window: { readAt: '2026-09-04T08:00:00Z', deadline: null, open: true },
      worstHour: 20,
      surplus: 2500,
      required: 2000,
      margin: 500,
      headroom: { value: 1400, percentile: 0.3, extreme: false },
      dwell: { value: 2.5, percentile: 0.2, extreme: false },
      eveMargin: { value: null, percentile: null, extreme: false },
      compass: { level: null, extreme: false, hours: [] },
      extremeCount: 0,
      tightHours: [],
      event: null,
      observation: null,
      verdict: 'otwarte',
      readings: [['2026-09-04T08:00:00Z', 2500, 2000]],
      // The current forecast already has a real exchange for this date — the
      // ordinary open-day case, plain "otwarte" with no caveat.
      exchangePlanned: true,
    },
  ],
  // Newest first, per the contract comment on BadanieFile.observations.
  observations: [
    {
      date: '2026-09-02',
      outcome: 'test',
      hour: 20,
      scope: 'unit',
      note: 'jedna jednostka wyłączona',
      source: 'register',
    },
    { date: '2026-09-01', outcome: 'none', source: 'issue', issueNumber: 3 },
    {
      date: '2026-08-31',
      outcome: 'real',
      hour: 19,
      scope: 'market',
      source: 'issue',
      issueNumber: 9,
    },
  ],
  events: [
    { date: '2026-09-02', hour: 20, kind: 'test', scope: 'unit', note: 'jedna jednostka wyłączona' },
  ],
};

/** Minimum shape read from the GitHub issues list by PendingIssues. */
type IssueFixture = { number: number; title: string; html_url: string };

/**
 * Routes the mocked fetch by URL: the page hits two different endpoints
 * (badanie.json and the GitHub issues list), and each test only cares about
 * shaping one or the other. Defaults keep the other endpoint harmless —
 * `issues: []` so PendingIssues renders nothing unless a test asks otherwise.
 */
function respondWith(routes: {
  badanie?: unknown;
  badanieOk?: boolean;
  issues?: IssueFixture[];
  issuesOk?: boolean;
}) {
  const { badanie, badanieOk = true, issues = [], issuesOk = true } = routes;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === BADANIE_URL) {
        return Promise.resolve({ ok: badanieOk, json: async () => badanie });
      }
      if (url === ISSUES_URL) {
        return Promise.resolve({ ok: issuesOk, json: async () => issues });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    })
  );
}

describe('Badanie', () => {
  it('opens on a file written before observations existed', async () => {
    // Strip the fields the 06.09 generator added; the page must still render
    // every table and the recorder, with nothing recorded.
    const older = JSON.parse(JSON.stringify(FIXTURE)) as Record<string, unknown>;
    delete older.observations;
    for (const day of older.days as Record<string, unknown>[]) {
      delete day.observation;
      delete day.tightHours; // added 07.09 — crashed the live page once
      delete day.exchangePlanned; // added 07.09 too — same risk, same guard
      // compass.hours added 07.09, same day as the others above: the
      // generator can be one deploy behind, so compass.level/extreme exist
      // but hours does not yet.
      const compass = day.compass as Record<string, unknown> | undefined;
      if (compass) delete compass.hours;
    }
    respondWith({ badanie: older });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');
    expect(screen.getByText('Zapisz, co było')).toBeInTheDocument();
    expect(screen.queryByText('Błąd aplikacji')).toBeNull();
    // Expanding a day touches tightHours and readings — must not throw either.
    fireEvent.click(screen.getByRole('button', { name: '02.09' }));
    expect(screen.queryByText('Błąd aplikacji')).toBeNull();
  });


  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the pinned URL, uncached', async () => {
    respondWith({ badanie: FIXTURE });
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
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);

    expect(await screen.findByText('Badanie przywołań')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Strona robocza. Nic z tego nie trafia na ekran główny, dopóki reguła nie sprawdzi się na kolejnych zdarzeniach.'
      )
    ).toBeInTheDocument();
  });

  it('marks the day with an event as a hit, naming the event kind', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('02.09').closest('tr')!;
    expect(within(row).getByText('trafienie')).toBeInTheDocument();
    // Register-sourced observation mirrors the event: shown once, in the
    // existing format, no "(z GitHub)" tag.
    expect(within(row).getByText('test, jedna jednostka')).toBeInTheDocument();
    expect(within(row).queryByText(/z GitHub/)).toBeNull();
    // The event row is bold — the one visual distinction this "may look like
    // garbage" page still has to make.
    expect(row.className).toContain('font-semibold');
  });

  it('labels the dwell column in hours and formats its value with one decimal and a Polish comma', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    expect(screen.getAllByRole('button', { name: 'Dwell (h)' })[0]).toBeInTheDocument();
    const row = screen.getByText('02.09').closest('tr')!;
    // 17.5 -> "17,5 h", not "17.5 h" (English decimal point) nor the bare
    // MW-style integer formatting `formatMW` used to apply here.
    expect(within(row).getByText('17,5 h')).toBeInTheDocument();
  });

  it('formats compass hours as compact ranges under the level: a run as "19–20", a lone hour joined with a comma', async () => {
    const withHourRun: BadanieFile = {
      ...FIXTURE,
      days: FIXTURE.days.map((day) =>
        day.date === '2026-09-02'
          ? { ...day, compass: { ...day.compass, hours: [17, 19, 20] } }
          : day
      ),
    };
    respondWith({ badanie: withHourRun });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('02.09').closest('tr')!;
    expect(within(row).getByText('17, 19–20')).toBeInTheDocument();
  });

  it('paints an extreme feature cell in the alarm colours', async () => {
    respondWith({ badanie: FIXTURE });
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
    respondWith({ badanie: FIXTURE });
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
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');
    const tableOf = (caption: RegExp) =>
      screen.getByRole('table', { name: caption }) as HTMLElement;
    // The open day (04.09) is the only row in the "ahead" table.
    expect(within(tableOf(/jeszcze nie minął/)).getByRole('button', { name: '04.09' })).toBeInTheDocument();
    expect(within(tableOf(/jeszcze nie minął/)).queryByRole('button', { name: '02.09' })).toBeNull();
    // The event day (02.09) is notable; the quiet days (01.09, 03.09) are not.
    expect(within(tableOf(/ze zdarzeniem/)).getByRole('button', { name: '02.09' })).toBeInTheDocument();
    expect(within(tableOf(/ze zdarzeniem/)).queryByRole('button', { name: '03.09' })).toBeNull();
    // Quiet days live inside a collapsed <details>, counted in its summary —
    // three now: 31.08 (issue-observed real, no register event), 01.09
    // (issue-observed "nic"), and 03.09 (no entry at all).
    const fold = screen.getByText(/Cisza — 3 dób/).closest('details');
    expect(fold).not.toBeNull();
    expect(fold).not.toHaveAttribute('open');
    expect(within(fold as HTMLElement).getByRole('button', { name: '03.09' })).toBeInTheDocument();
    expect(within(fold as HTMLElement).getByRole('button', { name: '01.09' })).toBeInTheDocument();
    expect(within(fold as HTMLElement).getByRole('button', { name: '31.08' })).toBeInTheDocument();
  });

  it('explains a column at once on hover and pins it on click', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');
    // The first table's header buttons; every table has its own hint line.
    const dwell = screen.getAllByRole('button', { name: 'Dwell (h)' })[0];
    const status = () => screen.getAllByRole('status')[0];
    expect(status().textContent).toMatch(/Najedź na nagłówek/);
    // Hover: shown immediately, no browser tooltip delay involved.
    fireEvent.mouseEnter(dwell);
    expect(status().textContent).toMatch(/siedziała poniżej/);
    fireEvent.mouseLeave(dwell);
    expect(status().textContent).toMatch(/Najedź na nagłówek/);
    // Click pins it — the only gesture a phone has.
    fireEvent.click(dwell);
    expect(dwell).toHaveAttribute('aria-pressed', 'true');
    expect(status().textContent).toMatch(/siedziała poniżej/);
    // With one column pinned, hovering another wins for as long as the
    // pointer stays there, then the pinned one comes back.
    const zapas = screen.getAllByRole('button', { name: 'Zapas' })[0];
    fireEvent.mouseEnter(zapas);
    expect(status().textContent).toMatch(/nad progiem/);
    fireEvent.mouseLeave(zapas);
    expect(status().textContent).toMatch(/siedziała poniżej/);
    fireEvent.click(dwell);
    expect(status().textContent).toMatch(/Najedź na nagłówek/);
    // Every feature column has something to say.
    for (const label of ['Zapas', 'D−1 wiecz.', 'Kompas', 'Ekstrema', 'Werdykt']) {
      expect(screen.getAllByRole('button', { name: label })[0]).toBeInTheDocument();
    }
  });

  it('leaves a quiet day without any observation unmarked', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('03.09').closest('tr')!;
    expect(within(row).getByText('cisza')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument(); // no event, no observation
    expect(row.className).not.toContain('font-semibold');
    expect(row.querySelector('.bg-alarm-soft')).toBeNull();
  });

  it('marks a quiet day with an issue-sourced "nothing" observation, muted', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('01.09').closest('tr')!;
    const cell = within(row).getByText('u nas nic').closest('td')!;
    expect(cell.className).toContain('text-text-secondary');
    // Grey text, not the bold hit styling: an observed "nic" is not an event.
    expect(row.className).not.toContain('font-semibold');
  });

  it('tags a test/real observation from Issues, with no register event behind it', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('31.08').closest('tr')!;
    expect(within(row).getByText('przywołanie, cały rynek (z GitHub)')).toBeInTheDocument();
  });

  it('expands a day to its readings, marking the window reading', async () => {
    respondWith({ badanie: FIXTURE });
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

    // Exchange carried on each reading, signed like PSEDataPoint.exchange
    // (negative = export) — changed between the two, flagged only from the
    // second reading on, since the first has nothing to compare against.
    expect(items[0].textContent).toContain(`wymiana ${signedMW(-800)}`);
    expect(items[0].textContent).not.toContain('zmiana salda');
    expect(items[1].textContent).toContain(`wymiana ${signedMW(-1200)}`);
    expect(items[1].textContent).toContain('(zmiana salda)');

    // Above the readings, the day's other tight hours from `DayStudy.tightHours`.
    expect(details.textContent).toContain(
      `Inne godziny z ujemnym marginesem w oknie: 18:00 (${signedMW(-300)}), 21:00 (${signedMW(-120)}).`
    );

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(detailsId)).toBeNull();
  });

  it('says "brak" for the other-tight-hours line when the day has none', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const button = screen.getByRole('button', { name: '03.09' }); // tightHours: []
    const detailsId = button.getAttribute('aria-controls')!;
    fireEvent.click(button);

    const details = document.getElementById(detailsId)!;
    expect(details.textContent).toContain('Inne godziny z ujemnym marginesem w oknie: brak.');
  });

  it('shows "—" for wymiana when a reading carries no exchange figure', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const button = screen.getByRole('button', { name: '03.09' }); // reading has no 4th element
    const detailsId = button.getAttribute('aria-controls')!;
    fireEvent.click(button);

    const details = document.getElementById(detailsId)!;
    const item = within(details).getAllByRole('listitem')[0];
    expect(item.textContent).toContain('wymiana —');
  });

  it('tags a reading whose exchange is still the placeholder "przed saldem", and keeps it out of the warn colour', async () => {
    // Below dwellFloorMw (1500) AND carrying the −12 MW placeholder — the
    // same shape `readingHasExchange` treats as "not yet planned" — so this
    // reading must read "przed saldem" and stay UNcoloured, unlike a genuine
    // below-floor reading (see the 02.09 case in the "expands a day..." test,
    // which has a real exchange and IS coloured).
    const withPlaceholder: BadanieFile = {
      ...FIXTURE,
      days: FIXTURE.days.map((day) =>
        day.date === '2026-09-03'
          ? { ...day, readings: [['2026-09-03T10:00:00Z', 900, 2000, -12]] as typeof day.readings }
          : day
      ),
    };
    respondWith({ badanie: withPlaceholder });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const button = screen.getByRole('button', { name: '03.09' });
    const detailsId = button.getAttribute('aria-controls')!;
    fireEvent.click(button);

    const details = document.getElementById(detailsId)!;
    const item = within(details).getAllByRole('listitem')[0];
    expect(item.textContent).toContain('przed saldem');
    expect(item.className).not.toContain('text-warn-text');
  });

  it('marks an open day as open instead of showing a window time', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('04.09').closest('tr')!;
    // Both the "Okno" cell and the "Werdykt" cell say "otwarte" here.
    expect(within(row).getAllByText('otwarte')).toHaveLength(2);
    // Muted, not bold — no event, and the day itself is still open.
    expect(row.className).toContain('text-text-secondary');
  });

  it('tags an open day "otwarte · bez salda" in the Werdykt column when the forecast has no exchange for it yet', async () => {
    const withoutExchange: BadanieFile = {
      ...FIXTURE,
      days: FIXTURE.days.map((day) =>
        day.date === '2026-09-04' ? { ...day, exchangePlanned: false } : day
      ),
    };
    respondWith({ badanie: withoutExchange });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const row = screen.getByText('04.09').closest('tr')!;
    // The "Okno" cell keeps saying plain "otwarte" — only Werdykt gets the caveat.
    expect(within(row).getByText('otwarte')).toBeInTheDocument();
    expect(within(row).getByText('otwarte · bez salda')).toBeInTheDocument();
  });

  it('shows the fixed note above "Przed nami" about the exchange arriving a day ahead', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    expect(
      screen.getByText(
        'Doby od pojutrza nie mają jeszcze salda wymiany — rezerwa liczona bez importu i eksportu, po dodaniu planu może się zmienić o kilka gigawatów w obie strony. Saldo dochodzi dzień wcześniej około 13:00.'
      )
    ).toBeInTheDocument();
  });

  it('shows an error rather than throwing when the fetch is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<Badanie />);

    expect(
      await screen.findByText('Brak danych badania — nie udało się pobrać pliku.')
    ).toBeInTheDocument();
  });

  it('shows an error when the server responds but not ok', async () => {
    respondWith({ badanie: null, badanieOk: false });
    render(<Badanie />);

    expect(
      await screen.findByText('Brak danych badania — nie udało się pobrać pliku.')
    ).toBeInTheDocument();
  });

  it('lists the event and observation register in the footer, newest first', async () => {
    respondWith({ badanie: FIXTURE });
    render(<Badanie />);
    await screen.findByText('Badanie przywołań');

    const footer = screen.getByText('Rejestr zdarzeń i obserwacji').closest('footer')!;
    const entries = within(footer).getAllByRole('listitem');
    expect(entries.map((li) => li.textContent)).toEqual([
      '02.09 20:00 — test, jedna jednostka: jedna jednostka wyłączona',
      '01.09 — u nas nic (z GitHub #3)',
      '31.08 19:00 — przywołanie, cały rynek (z GitHub #9)',
    ]);
  });

  describe('defaultDraftFor', () => {
    it('picks the newest closed day without an entry', () => {
      expect(defaultDraftFor(FIXTURE.days)).toBe('2026-09-03');
    });

    it('falls back to the newest closed day when every one has an entry', () => {
      const allEntered = FIXTURE.days.map((day) =>
        day.date === '2026-09-03' ? { ...day, observation: FIXTURE.observations[0] } : day
      );
      expect(defaultDraftFor(allEntered)).toBe('2026-09-03');
    });

    it('ignores open days entirely', () => {
      const onlyOpen = FIXTURE.days.filter((day) => day.window.open);
      expect(defaultDraftFor(onlyOpen)).toBeNull();
    });
  });

  describe('defaultHourFor', () => {
    it('uses the day\'s own target hour when it falls in 7-21', () => {
      expect(defaultHourFor({ ...FIXTURE.days[2], worstHour: 20 })).toBe(20);
      expect(defaultHourFor({ ...FIXTURE.days[2], worstHour: 7 })).toBe(7);
      expect(defaultHourFor({ ...FIXTURE.days[2], worstHour: 21 })).toBe(21);
    });

    it('falls back to 19 when the target hour is outside 7-21', () => {
      expect(defaultHourFor({ ...FIXTURE.days[2], worstHour: 6 })).toBe(19);
      expect(defaultHourFor({ ...FIXTURE.days[2], worstHour: 22 })).toBe(19);
      expect(defaultHourFor({ ...FIXTURE.days[2], worstHour: null })).toBe(19);
    });

    it('falls back to 19 when there is no day at all', () => {
      expect(defaultHourFor(null)).toBe(19);
    });
  });

  describe('"Zapisz, co było"', () => {
    it('defaults to the newest closed day without an entry, outcome "none"', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      const select = screen.getByLabelText('Doba') as HTMLSelectElement;
      expect(select.value).toBe('2026-09-03');
      expect(
        (screen.getByLabelText('u nas nic było') as HTMLInputElement).checked
      ).toBe(true);
      // The date select carries the "bez wpisu" / "zapisane" hint per option.
      const options = within(select).getAllByRole('option') as HTMLOptionElement[];
      expect(options.find((o) => o.value === '2026-09-03')!.textContent).toBe('03.09 — bez wpisu');
      expect(options.find((o) => o.value === '2026-09-02')!.textContent).toContain('zapisane');
    });

    it('follows the day select to a different day, with its own target hour', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      const select = screen.getByLabelText('Doba') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '2026-09-02' } });
      expect(select.value).toBe('2026-09-02');

      // 02.09's own target hour (20:00) replaces 03.09's (21:00).
      fireEvent.click(screen.getByLabelText('test'));
      const hourSelect = screen.getByLabelText('Godzina') as HTMLSelectElement;
      expect(hourSelect.value).toBe('20');
    });

    it('disables hour and scope for "none" instead of hiding them, and enables them for "test"', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      // Always visible — the owner's own complaint was that the hour picker
      // only appeared once an outcome was already chosen, so it went unseen.
      expect(screen.getByLabelText('Godzina')).toBeInTheDocument();
      expect(screen.getByLabelText('jedna lub kilka jednostek')).toBeInTheDocument();
      expect(screen.getByLabelText('cały rynek')).toBeInTheDocument();
      expect(screen.getByLabelText('Godzina')).toBeDisabled();
      expect(screen.getByLabelText('jedna lub kilka jednostek')).toBeDisabled();
      expect(screen.getByLabelText('cały rynek')).toBeDisabled();
      expect(screen.getByText('(dla testu lub przywołania)')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('test'));
      expect(screen.getByLabelText('Godzina')).toBeEnabled();
      expect(screen.getByLabelText('jedna lub kilka jednostek')).toBeEnabled();
      expect(screen.getByLabelText('cały rynek')).toBeEnabled();
      expect(screen.queryByText('(dla testu lub przywołania)')).toBeNull();
    });

    it('lists hours 7:00-21:00 only, per rozporządzenie §6', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      const select = screen.getByLabelText('Godzina') as HTMLSelectElement;
      const values = within(select)
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value);
      expect(values).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 7)));
    });

    it('defaults the hour to the day\'s own target hour when it falls in 7-21, else 19', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      // 03.09's own target hour, 21, is within 7-21 — used as-is.
      expect((screen.getByLabelText('Godzina') as HTMLSelectElement).value).toBe('21');

      // 01.09 (event-mirrored register day 02.09 aside) has target hour 20 —
      // also within range.
      fireEvent.change(screen.getByLabelText('Doba'), { target: { value: '2026-09-02' } });
      expect((screen.getByLabelText('Godzina') as HTMLSelectElement).value).toBe('20');
    });

    it('builds the exact issue link for the chosen values', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      fireEvent.change(screen.getByLabelText('Doba'), { target: { value: '2026-09-03' } });
      fireEvent.click(screen.getByLabelText('test'));
      fireEvent.change(screen.getByLabelText('Godzina'), { target: { value: '20' } });
      // Scope stays at its default, "jedna lub kilka jednostek" (unit).

      const link = screen.getByRole('link', { name: 'Zapisz w GitHub' }) as HTMLAnchorElement;
      const url = new URL(link.href);
      expect(url.origin + url.pathname).toBe(
        'https://github.com/bartorux/dashboard-iphone/issues/new'
      );
      expect(url.searchParams.get('title')).toBe('[badanie] 2026-09-03 20:00 test jednostka');
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
    });

    it('omits the hour from the title when the outcome is "none"', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      const link = screen.getByRole('link', { name: 'Zapisz w GitHub' }) as HTMLAnchorElement;
      const url = new URL(link.href);
      expect(url.searchParams.get('title')).toBe('[badanie] 2026-09-03 nic');
      expect(url.searchParams.get('title')).not.toMatch(/\d{2}:00/);
    });

    it('carries the note into the issue body', async () => {
      respondWith({ badanie: FIXTURE });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      fireEvent.change(screen.getByLabelText('Notatka (opcjonalnie)'), {
        target: { value: 'wezwanie o 11:14' },
      });
      const link = screen.getByRole('link', { name: 'Zapisz w GitHub' }) as HTMLAnchorElement;
      const url = new URL(link.href);
      expect(url.searchParams.get('body')).toBe('wezwanie o 11:14');
    });
  });

  describe('"Zgłoszone, czeka na przeliczenie"', () => {
    it('shows an issue not yet folded into observations, hides one already there', async () => {
      respondWith({
        badanie: FIXTURE,
        issues: [
          // Already reflected in FIXTURE.observations (source: 'issue') — must not reappear.
          { number: 3, title: '[badanie] 2026-09-01 nic', html_url: 'https://github.com/x/y/issues/3' },
          // Not yet in observations — this is the one the list is for.
          { number: 7, title: '[badanie] 2026-09-05 20:00 test jednostka', html_url: 'https://github.com/x/y/issues/7' },
        ],
      });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      const section = await screen.findByText('Zgłoszone, czeka na przeliczenie');
      const list = section.closest('section')!;
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toBe('05.09 20:00 — test, jedna jednostka (#7)');
      const link = within(items[0]).getByRole('link') as HTMLAnchorElement;
      expect(link.href).toBe('https://github.com/x/y/issues/7');
    });

    it('shows nothing when every open issue is already accounted for', async () => {
      respondWith({
        badanie: FIXTURE,
        issues: [
          { number: 3, title: '[badanie] 2026-09-01 nic', html_url: 'https://github.com/x/y/issues/3' },
        ],
      });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      await waitFor(() => expect(fetch).toHaveBeenCalledWith(ISSUES_URL, { cache: 'no-store' }));
      expect(screen.queryByText('Zgłoszone, czeka na przeliczenie')).toBeNull();
    });

    it('does not break the page when the GitHub fetch fails', async () => {
      respondWith({ badanie: FIXTURE, issuesOk: false });
      render(<Badanie />);
      await screen.findByText('Badanie przywołań');

      await waitFor(() => expect(fetch).toHaveBeenCalledWith(ISSUES_URL, { cache: 'no-store' }));
      expect(screen.queryByText('Zgłoszone, czeka na przeliczenie')).toBeNull();
      // The rest of the page is unaffected.
      expect(screen.getByText('02.09')).toBeInTheDocument();
    });
  });
});
