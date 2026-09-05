import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompass } from '../useCompass';
import { PSECompassRawItem } from '../../types';

/**
 * Split from useCompass.test.ts on purpose: that file mocks '../../utils/api'
 * wholesale to test the hook's own branches in isolation, which would hide the
 * one thing this file exists to prove — that the REAL fetchCompass keeps
 * asking pdgsz for `is_active eq true`, the filter that keeps a republished
 * period's superseded row out of the response.
 */
function row(businessDate: string, hour: string, usage: number): PSECompassRawItem {
  return {
    business_date: businessDate,
    dtime: `${businessDate} ${hour}`,
    dtime_utc: `${businessDate} ${hour}`,
    usage_fcst: usage,
    is_active: true,
    publication_ts_utc: '2026-09-05 12:00:00.000',
  };
}

describe('useCompass — filtr na prawdziwym fetchCompass', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 5, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks pdgsz for the active version of the record only', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: [row('2026-09-05', '10:00', 1)] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useCompass(true, '2026-09-05'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain('is_active eq true');
  });
});
