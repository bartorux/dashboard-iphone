import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNews } from '../useNews';
import { useNewsSeen } from '../useNewsSeen';
import type { NewsFile } from '../../utils/newsTypes';

const file: NewsFile = {
  generatedAt: '2026-09-17T16:00:00.000Z',
  groups: [
    { id: 'sieci', label: 'Sieci', items: [{ id: 's1', title: 'Komunikat OSP', url: 'https://www.pse.pl/a', source: 'PSE', publishedAt: '2026-09-17T09:39:00.000Z' }] },
    { id: 'regulacje', label: 'Regulacje', items: [] },
    { id: 'energetyka', label: 'Energetyka', items: [] },
    { id: 'paliwa', label: 'Paliwa i gaz', items: [] },
  ],
};

function respondWith(value: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => value }));
}

describe('useNews', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('reads a well-formed file', async () => {
    respondWith(file);
    const { result } = renderHook(() => useNews().news);
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.groups[0].items[0].source).toBe('PSE');
  });

  it('treats a 404, a dead network and a malformed file alike: no card', async () => {
    respondWith(null, false);
    const { result: missing } = renderHook(() => useNews().news);
    await waitFor(() => expect(missing.current).toBeNull());

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result: offline } = renderHook(() => useNews().news);
    await waitFor(() => expect(offline.current).toBeNull());

    respondWith({ generatedAt: 'wczoraj', groups: [] });
    const { result: broken } = renderHook(() => useNews().news);
    await waitFor(() => expect(broken.current).toBeNull());
  });

  it('re-reads when the app comes back into view', async () => {
    respondWith(file);
    renderHook(() => useNews());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});

const item = (id: string, publishedAt: string) => ({
  id,
  title: `Tytuł ${id}`,
  url: `https://x.pl/${id}`,
  source: 'CIRE',
  publishedAt,
});

describe('useNewsSeen', () => {
  beforeEach(() => localStorage.clear());

  it('starts a first visit with nothing new', () => {
    const { result } = renderHook(() => useNewsSeen());
    expect(result.current.isNew(item('a', '2026-09-17T09:00:00Z'))).toBe(false);
  });

  it('counts headlines published after the last close as new', () => {
    localStorage.setItem('pse-dashboard-news-seen', JSON.stringify({ seenAt: '2026-09-17T12:00:00.000Z', readIds: [] }));
    const { result } = renderHook(() => useNewsSeen());
    expect(result.current.isNew(item('a', '2026-09-17T13:00:00Z'))).toBe(true);
    expect(result.current.isNew(item('b', '2026-09-17T11:00:00Z'))).toBe(false);
  });

  it('an opened article stops being new, and stays so across a remount', () => {
    localStorage.setItem('pse-dashboard-news-seen', JSON.stringify({ seenAt: '2026-09-17T12:00:00.000Z', readIds: [] }));
    const { result } = renderHook(() => useNewsSeen());
    act(() => result.current.markRead('a'));
    expect(result.current.isNew(item('a', '2026-09-17T13:00:00Z'))).toBe(false);

    const again = renderHook(() => useNewsSeen());
    expect(again.result.current.isNew(item('a', '2026-09-17T13:00:00Z'))).toBe(false);
  });

  it('closing the panel clears everything that was new', () => {
    localStorage.setItem('pse-dashboard-news-seen', JSON.stringify({ seenAt: '2026-09-17T12:00:00.000Z', readIds: [] }));
    const { result } = renderHook(() => useNewsSeen());
    const fresh = item('a', new Date(Date.now() - 1000).toISOString());
    expect(result.current.isNew(fresh)).toBe(true);
    act(() => result.current.markSeen());
    expect(result.current.isNew(fresh)).toBe(false);
  });

  it('survives storage that throws, keeping the state for this session', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useNewsSeen());
    expect(() => act(() => result.current.markRead('a'))).not.toThrow();
    expect(result.current.isNew(item('a', '2026-09-17T13:00:00Z'))).toBe(false);
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('keeps the read list from growing without bound', () => {
    localStorage.setItem('pse-dashboard-news-seen', JSON.stringify({ seenAt: '2026-09-17T12:00:00.000Z', readIds: [] }));
    const { result } = renderHook(() => useNewsSeen());
    act(() => {
      for (let index = 0; index < 320; index++) result.current.markRead(`id-${index}`);
    });
    const stored = JSON.parse(localStorage.getItem('pse-dashboard-news-seen') ?? '{}') as { readIds: string[] };
    expect(stored.readIds).toHaveLength(300);
    expect(stored.readIds).toContain('id-319');
    expect(stored.readIds).not.toContain('id-0');
  });
});
