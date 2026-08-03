import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchPSEData, fetchPSEHistory } from '../api';

const ok = (value: unknown[]) => ({
  ok: true,
  json: async () => ({ value }),
});

describe('fetchPSEData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks for the full business-day window with explicit timestamps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPSEData();

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    // Bug 1.1: date-only bounds excluded "2026-08-06 00:00:00" through string
    // comparison, permanently cutting the last hour of the third day
    expect(url).toContain("ge '2026-08-03 01:00:00'");
    expect(url).toContain("le '2026-08-06 00:00:00'");
    expect(url).toContain('$orderby=plan_dtime');
  });

  it('falls back to the newest records, not the oldest', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPSEData();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = decodeURIComponent(String(fetchMock.mock.calls[1][0]));
    // Bug 1.2: the old fallback had no $orderby, so PSE returned June 2024 data
    expect(url).toContain('$orderby=plan_dtime desc');
  });

  it('uses the fallback when the network throws', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPSEData()).resolves.toHaveLength(1);
  });

  it('treats a 200 with an empty value list as no data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPSEData()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when both requests fail, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(fetchPSEData()).resolves.toEqual([]);
  });
});

describe('fetchPSEData — field selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks for every field the UI reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPSEData();

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    // Omitting one of these leaves a chart series silently empty, with no error
    // to point at the cause.
    for (const field of [
      'business_date',
      'period',
      'plan_dtime',
      'plan_dtime_utc',
      'req_pow_res',
      'surplus_cap_avail_tso',
      'grid_demand_fcst',
      'fcst_pv_tot_gen',
      'fcst_wi_tot_gen',
      'sum_unav_oper_cond',
      'planned_exchange',
    ]) {
      expect(url, `missing field: ${field}`).toContain(field);
    }
  });

  it('narrows the fallback the same way', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPSEData();

    expect(decodeURIComponent(String(fetchMock.mock.calls[1][0]))).toContain(
      'grid_demand_fcst'
    );
  });
});

describe('fetchPSEHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requests whole past business days, excluding today', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPSEHistory(30);

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain("business_date ge '2026-07-04'");
    // Today's figures are still a forecast under revision
    expect(url).toContain("business_date le '2026-08-02'");
  });

  it('asks only for what the distribution needs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([{ plan_dtime: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPSEHistory(30);

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    // Keeps 30 days at ~7.5 KB gzipped instead of half a megabyte
    expect(url).not.toContain('grid_demand_fcst');
    expect(url).toContain('surplus_cap_avail_tso');
  });

  it('returns an empty array rather than throwing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(fetchPSEHistory()).resolves.toEqual([]);
  });
});
