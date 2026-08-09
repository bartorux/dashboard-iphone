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
};

describe('useSummary', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('returns a recent summary', async () => {
    respondWith(fresh);
    const { result } = renderHook(() => useSummary(NOW));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.headline).toBe(fresh.headline);
  });

  it('hides a summary too old to describe the same day', async () => {
    respondWith({
      ...fresh,
      generatedAt: new Date(NOW.getTime() - MAX_AGE_MS - 1000).toISOString(),
    });
    const { result } = renderHook(() => useSummary(NOW));

    // Nothing to wait for — it must never appear.
    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });

  it('survives a missing file, a broken payload and a dead network', async () => {
    // None of these may take the rest of the screen down with them: the chart,
    // the alerts and the analysis all come straight from PSE.
    respondWith(null, false);
    const missing = renderHook(() => useSummary(NOW));

    respondWith({ headline: 'bez reszty pol' });
    const broken = renderHook(() => useSummary(NOW));

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const offline = renderHook(() => useSummary(NOW));

    await new Promise((done) => setTimeout(done, 10));
    expect(missing.result.current).toBeNull();
    expect(broken.result.current).toBeNull();
    expect(offline.result.current).toBeNull();
  });

  it('rejects an unparseable timestamp rather than showing undated text', async () => {
    respondWith({ ...fresh, generatedAt: 'kiedys' });
    const { result } = renderHook(() => useSummary(NOW));

    await new Promise((done) => setTimeout(done, 10));
    expect(result.current).toBeNull();
  });
});
