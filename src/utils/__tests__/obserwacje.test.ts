import { describe, it, expect } from 'vitest';
import {
  ISSUE_PREFIX,
  formatObservationTitle,
  issueUrlFor,
  observationsFromIssues,
  parseObservationTitle,
} from '../obserwacje';
import type { ObservationDraft, IssueLike } from '../obserwacje';

// ---------------------------------------------------------------------------
// formatObservationTitle / parseObservationTitle — round trip
// ---------------------------------------------------------------------------

describe('formatObservationTitle / parseObservationTitle round trip', () => {
  const cases: ObservationDraft[] = [
    { date: '2026-09-07', outcome: 'none' },
    { date: '2026-09-07', outcome: 'test', hour: 20, scope: 'unit' },
    { date: '2026-09-07', outcome: 'test', hour: 20, scope: 'market' },
    { date: '2026-09-07', outcome: 'real', hour: 20, scope: 'unit' },
    { date: '2026-09-07', outcome: 'real', hour: 20, scope: 'market' },
    { date: '2026-01-01', outcome: 'real', hour: 0, scope: 'market' }, // hour 0 padding
  ];

  it.each(cases)('round-trips %j', (draft) => {
    const title = formatObservationTitle(draft);
    expect(parseObservationTitle(title)).toEqual(draft);
  });

  it('formats "none" as the fixed literal "nic", carrying nothing else', () => {
    expect(formatObservationTitle({ date: '2026-09-07', outcome: 'none' })).toBe(
      `${ISSUE_PREFIX} 2026-09-07 nic`
    );
  });

  it('defaults scope to "unit" when omitted from the draft', () => {
    const title = formatObservationTitle({ date: '2026-09-07', outcome: 'test', hour: 20 });
    expect(title).toBe(`${ISSUE_PREFIX} 2026-09-07 20:00 test jednostka`);
    expect(parseObservationTitle(title)).toEqual({
      date: '2026-09-07',
      outcome: 'test',
      hour: 20,
      scope: 'unit',
    });
  });

  it('pads a single-digit hour to two digits', () => {
    expect(formatObservationTitle({ date: '2026-09-07', outcome: 'real', hour: 5, scope: 'unit' })).toBe(
      `${ISSUE_PREFIX} 2026-09-07 05:00 przywolanie jednostka`
    );
  });
});

// ---------------------------------------------------------------------------
// parseObservationTitle — rejection
// ---------------------------------------------------------------------------

describe('parseObservationTitle rejects anything outside the fixed shape', () => {
  it('rejects a title missing the [badanie] prefix', () => {
    expect(parseObservationTitle('2026-09-07 nic')).toBeNull();
  });

  it('rejects hour 24 (out of the 0-23 range)', () => {
    expect(parseObservationTitle(`${ISSUE_PREFIX} 2026-09-07 24:00 test jednostka`)).toBeNull();
  });

  it('accepts hour 23, the last valid hour', () => {
    expect(parseObservationTitle(`${ISSUE_PREFIX} 2026-09-07 23:00 test jednostka`)).toEqual({
      date: '2026-09-07',
      outcome: 'test',
      hour: 23,
      scope: 'unit',
    });
  });

  it('rejects a malformed date', () => {
    expect(parseObservationTitle(`${ISSUE_PREFIX} 2026-9-7 nic`)).toBeNull();
    expect(parseObservationTitle(`${ISSUE_PREFIX} 07-09-2026 nic`)).toBeNull();
  });

  it('rejects a title that is not the observation shape at all', () => {
    expect(parseObservationTitle('Random issue about something else')).toBeNull();
    expect(parseObservationTitle('')).toBeNull();
  });

  it('rejects an otherwise well-formed title with an unknown outcome/scope word', () => {
    expect(parseObservationTitle(`${ISSUE_PREFIX} 2026-09-07 20:00 cos jednostka`)).toBeNull();
    expect(parseObservationTitle(`${ISSUE_PREFIX} 2026-09-07 20:00 test cos`)).toBeNull();
  });

  it('tolerates case in the prefix and the outcome/scope words', () => {
    expect(parseObservationTitle(`[BADANIE] 2026-09-07 NIC`)).toEqual({
      date: '2026-09-07',
      outcome: 'none',
    });
    expect(parseObservationTitle(`[Badanie] 2026-09-07 20:00 TEST JEDNOSTKA`)).toEqual({
      date: '2026-09-07',
      outcome: 'test',
      hour: 20,
      scope: 'unit',
    });
    expect(parseObservationTitle(`[badanie] 2026-09-07 20:00 Przywolanie Rynek`)).toEqual({
      date: '2026-09-07',
      outcome: 'real',
      hour: 20,
      scope: 'market',
    });
  });
});

// ---------------------------------------------------------------------------
// observationsFromIssues
// ---------------------------------------------------------------------------

describe('observationsFromIssues', () => {
  it('a later issue number for the same date wins over an earlier one', () => {
    const issues: IssueLike[] = [
      { number: 5, title: `${ISSUE_PREFIX} 2026-09-07 nic` },
      { number: 12, title: `${ISSUE_PREFIX} 2026-09-07 20:00 test jednostka` },
    ];
    const observations = observationsFromIssues(issues);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toEqual({
      date: '2026-09-07',
      outcome: 'test',
      hour: 20,
      scope: 'unit',
      source: 'issue',
      issueNumber: 12,
    });
  });

  it('a later issue number wins regardless of array order (sorted by number internally)', () => {
    const issues: IssueLike[] = [
      { number: 12, title: `${ISSUE_PREFIX} 2026-09-07 20:00 test jednostka` },
      { number: 5, title: `${ISSUE_PREFIX} 2026-09-07 nic` },
    ];
    const observations = observationsFromIssues(issues);
    expect(observations).toHaveLength(1);
    expect(observations[0].issueNumber).toBe(12);
    expect(observations[0].outcome).toBe('test');
  });

  it('an empty or whitespace-only body produces no `note`', () => {
    const withEmptyBody = observationsFromIssues([
      { number: 1, title: `${ISSUE_PREFIX} 2026-09-07 nic`, body: '' },
    ]);
    expect(withEmptyBody[0].note).toBeUndefined();

    const withWhitespaceBody = observationsFromIssues([
      { number: 2, title: `${ISSUE_PREFIX} 2026-09-08 nic`, body: '   \n  ' },
    ]);
    expect(withWhitespaceBody[0].note).toBeUndefined();

    const withMissingBody = observationsFromIssues([
      { number: 3, title: `${ISSUE_PREFIX} 2026-09-09 nic` },
    ]);
    expect(withMissingBody[0].note).toBeUndefined();
  });

  it('carries a trimmed note through when the body is non-empty', () => {
    const observations = observationsFromIssues([
      { number: 1, title: `${ISSUE_PREFIX} 2026-09-07 nic`, body: '  U nas nic.  \n' },
    ]);
    expect(observations[0].note).toBe('U nas nic.');
  });

  it('skips issues whose title does not parse, without throwing', () => {
    const issues: IssueLike[] = [
      { number: 1, title: 'Something unrelated' },
      { number: 2, title: `${ISSUE_PREFIX} 2026-09-07 nic` },
    ];
    const observations = observationsFromIssues(issues);
    expect(observations).toHaveLength(1);
    expect(observations[0].date).toBe('2026-09-07');
  });

  it('returns one observation per distinct date, unrelated dates untouched by each other', () => {
    const issues: IssueLike[] = [
      { number: 1, title: `${ISSUE_PREFIX} 2026-09-06 nic` },
      { number: 2, title: `${ISSUE_PREFIX} 2026-09-07 20:00 przywolanie rynek` },
    ];
    const observations = observationsFromIssues(issues);
    const byDate = new Map(observations.map((o) => [o.date, o]));
    expect(byDate.get('2026-09-06')?.outcome).toBe('none');
    expect(byDate.get('2026-09-07')?.outcome).toBe('real');
  });
});

// ---------------------------------------------------------------------------
// issueUrlFor
// ---------------------------------------------------------------------------

describe('issueUrlFor', () => {
  it('encodes the title and body into a GitHub "new issue" link', () => {
    const draft: ObservationDraft = { date: '2026-09-07', outcome: 'test', hour: 20, scope: 'unit' };
    const url = issueUrlFor('bartorux/dashboard-iphone', draft, 'jedna jednostka wyłączona');

    expect(url.startsWith('https://github.com/bartorux/dashboard-iphone/issues/new?')).toBe(true);

    const query = new URL(url).searchParams;
    expect(query.get('title')).toBe(formatObservationTitle(draft));
    expect(query.get('body')).toBe('jedna jednostka wyłączona');
  });

  it('round-trips a body containing characters that need percent-encoding', () => {
    const draft: ObservationDraft = { date: '2026-09-07', outcome: 'none' };
    const note = 'Uwaga: 50% mocy & "cudzysłów" — myślnik';
    const url = issueUrlFor('bartorux/dashboard-iphone', draft, note);

    const query = new URL(url).searchParams;
    expect(query.get('body')).toBe(note);
    expect(query.get('title')).toBe(formatObservationTitle(draft));
  });
});
