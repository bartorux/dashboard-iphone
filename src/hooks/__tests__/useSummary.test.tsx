import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSummary, MAX_AGE_MS } from '../useSummary';

const NOW = new Date('2026-08-09T12:00:00Z');

function respondWith(value: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: async () => value })
  );
}

const fresh = {
  headline: 'Nie ma podstaw do przywołania.',
  body: 'Rezerwa pokrywa wymaganą wartość.',
  outlook: 'W kolejnych dniach bez zmian.',
  generatedAt: '2026-08-09T11:30:00Z',
  dates: ['2026-08-09', '2026-08-10', '2026-08-11'],
};

describe('useSummary', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('returns a recent summary', async () => {
    respondWith(fresh);
    const { result } = renderHook(() => useSummary(NOW).summary);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.headline).toBe(fresh.headline);
  });

  /*
   * The layer that took the card off production once already.
   *
   * Either line beneath the headline may be empty, depending on the shape the
   * prompt asked for — TREŚĆ on a quiet period with nothing to explain, DALEJ on
   * a quiet period with a cause, since there the verdict belongs in the headline.
   * The generator and the validator both know that; this guard is the third and
   * last to be told, and the time it was not, a perfectly good summary published
   * and the card silently was not there.
   */
  it.each([
    ['no body', { ...fresh, body: '' }],
    ['no outlook', { ...fresh, outlook: '' }],
  ])('shows a summary with %s', async (_label, payload) => {
    respondWith(payload);
    const { result } = renderHook(() => useSummary(NOW).summary);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.headline).toBe(fresh.headline);
  });

  it('refuses a headline with nothing under it', async () => {
    // Empty in pairs is the one combination no shape ever asks for, and a card
    // showing only its own answer would be thinner than the fields promise.
    respondWith({ ...fresh, body: '', outlook: '' });
    const { result } = renderHook(() => useSummary(NOW).summary);

    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });

  it('hides a summary too old to describe the same day', async () => {
    respondWith({
      ...fresh,
      generatedAt: new Date(NOW.getTime() - MAX_AGE_MS - 1000).toISOString(),
    });
    const { result } = renderHook(() => useSummary(NOW).summary);

    // Nothing to wait for — it must never appear.
    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });

  it('survives a missing file, a broken payload and a dead network', async () => {
    // None of these may take the rest of the screen down with them: the chart,
    // the alerts and the analysis all come straight from PSE.
    respondWith(null, false);
    const missing = renderHook(() => useSummary(NOW).summary);

    respondWith({ headline: 'bez reszty pol' });
    const broken = renderHook(() => useSummary(NOW).summary);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const offline = renderHook(() => useSummary(NOW).summary);

    await new Promise((done) => setTimeout(done, 10));
    expect(missing.result.current).toBeNull();
    expect(broken.result.current).toBeNull();
    expect(offline.result.current).toBeNull();
  });

  it('fetches again when the app comes back to the foreground', async () => {
    // Returning to a PWA does not remount the page, so a fetch on mount alone
    // left the text as it was while the chart refreshed itself on resume — the
    // two then described different moments. Killing the app was the only cure.
    respondWith(fresh);
    const { result } = renderHook(() => useSummary(NOW).summary);
    await waitFor(() => expect(result.current).not.toBeNull());

    const later = { ...fresh, headline: 'Nowa analiza.' };
    respondWith(later);
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(result.current?.headline).toBe('Nowa analiza.'));
  });

  it('shows a two-line summary, whose middle field is empty by design', async () => {
    // This guard predates the two-line shape and required every text field to be
    // non-empty. When the generator first published a summary with no TREŚĆ —
    // correct, because no day carried grounds — the guard read it as a broken
    // file and the card vanished from the page. Nothing errored; it simply was
    // not there.
    respondWith({ ...fresh, body: '' });
    const { result } = renderHook(() => useSummary(NOW));

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.summary?.body).toBe('');
    expect(result.current.summary?.outlook).toBeTruthy();
  });

  it('still refuses a file with no closing line at all', async () => {
    respondWith({ ...fresh, outlook: '' });
    const { result } = renderHook(() => useSummary(NOW));

    await waitFor(() => expect(result.current.summary).toBeNull());
  });

  it('refuses a file that cannot say which days it covers', async () => {
    // A card without its span looks merely unrefreshed when the day tabs are
    // switched and it does not follow — which is the confusion the field exists
    // to prevent, so a bare label is worse than no card.
    const { dates: _drop, ...withoutDates } = fresh;
    respondWith(withoutDates);
    const missing = renderHook(() => useSummary(NOW).summary);

    respondWith({ ...fresh, dates: [] });
    const empty = renderHook(() => useSummary(NOW).summary);

    await new Promise((done) => setTimeout(done, 10));
    expect(missing.result.current).toBeNull();
    expect(empty.result.current).toBeNull();
  });

  it('rejects an unparseable timestamp rather than showing undated text', async () => {
    respondWith({ ...fresh, generatedAt: 'kiedys' });
    const { result } = renderHook(() => useSummary(NOW).summary);

    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });
});
