import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NEWS_EXPERIMENT_KEY, useNewsExperiment } from '../useNewsExperiment';

/** The address the page was opened with; the hook reads it once, on mount. */
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

const variant = () => renderHook(() => useNewsExperiment()).result.current;

beforeEach(() => {
  sessionStorage.clear();
  openAt('');
});

afterEach(() => {
  vi.restoreAllMocks();
  openAt('');
});

describe('useNewsExperiment', () => {
  it('is null without the parameter — the page as it has always been', () => {
    expect(variant()).toBeNull();
  });

  it('names each of the three variants the address asks for', () => {
    for (const name of ['pasek', 'dol', 'gora'] as const) {
      sessionStorage.clear();
      openAt(`?z-branzy=${name}`);
      expect(variant()).toBe(name);
    }
  });

  it('is null for a value that is not a variant, and forgets an earlier choice', () => {
    openAt('?z-branzy=dol');
    expect(variant()).toBe('dol');

    openAt('?z-branzy=gorra');
    expect(variant()).toBeNull();
    openAt('');
    expect(variant()).toBeNull();
  });

  it('keeps the choice for the tab, so a trip to an article and back does not lose it', () => {
    openAt('?z-branzy=gora');
    expect(variant()).toBe('gora');

    openAt('');
    expect(variant()).toBe('gora');
    expect(sessionStorage.getItem(NEWS_EXPERIMENT_KEY)).toBe('gora');
  });

  it('"brak" goes back to the page as it is, and stays there', () => {
    openAt('?z-branzy=pasek');
    variant();

    openAt('?z-branzy=brak');
    expect(variant()).toBeNull();
    expect(sessionStorage.getItem(NEWS_EXPERIMENT_KEY)).toBeNull();
    openAt('');
    expect(variant()).toBeNull();
  });

  it('ignores a stored value it does not know', () => {
    sessionStorage.setItem(NEWS_EXPERIMENT_KEY, 'boczny');
    expect(variant()).toBeNull();
  });

  it('is null from 48rem whatever the address says — the computer has its own card', () => {
    const restore = mockMedia(['(min-width: 48rem)']);
    try {
      openAt('?z-branzy=dol');
      expect(variant()).toBeNull();
    } finally {
      restore();
    }
  });

  it('still follows the address where the tab has no storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    openAt('?z-branzy=pasek');
    expect(variant()).toBe('pasek');
  });

  it('reads the address once: a later change of it does not swap the variant under the reader', () => {
    openAt('?z-branzy=dol');
    const { result, rerender } = renderHook(() => useNewsExperiment());
    openAt('?z-branzy=gora');
    rerender();
    expect(result.current).toBe('dol');
  });
});
