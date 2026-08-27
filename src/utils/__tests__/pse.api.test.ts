import { describe, it, expect } from 'vitest';
import { API_URL, API_BASE } from '../constants';

/**
 * Contract test against the live PSE endpoint. Excluded from `npm test` and CI —
 * run with `npm run test:api`. Its job is to catch an upstream change before it
 * shows up as an empty chart on the phone.
 */
describe('PSE API contract', () => {
  it('serves 72 hourly records for the current three business days', async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = (d: Date, hour: number) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hour)}:00:00`;

    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);

    const url =
      `${API_URL}?$filter=plan_dtime ge '${stamp(today, 1)}' and ` +
      `plan_dtime le '${stamp(end, 0)}'&$orderby=plan_dtime&$first=200`;

    const response = await fetch(url);
    expect(response.ok).toBe(true);

    const { value } = await response.json();
    expect(value.length).toBe(72);

    const first = value[0];
    expect(first.plan_dtime).toBe(stamp(today, 1));

    for (const field of [
      'plan_dtime',
      'plan_dtime_utc',
      'business_date',
      'period',
      'req_pow_res',
      'surplus_cap_avail_tso',
    ]) {
      expect(first, `missing field: ${field}`).toHaveProperty(field);
    }
  });

  it('serves the active Kompas Energetyczny version for today (pdgsz)', async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const url =
      `${API_BASE}/pdgsz?$filter=business_date eq '${dateStr}' and ` +
      `is_active eq true&$first=100`;

    const response = await fetch(url);
    expect(response.ok).toBe(true);

    const { value } = await response.json();
    // Normally 24 hourly records; a DST changeover day has 23 or 25.
    expect(value.length).toBeGreaterThanOrEqual(23);

    for (const record of value) {
      expect(record).toHaveProperty('usage_fcst');
      expect(record).toHaveProperty('dtime_utc');
      expect(record.is_active).toBe(true);
      expect(record).toHaveProperty('business_date');
    }
  });

  it('serves the non-market redispatch records for today (poze-redoze)', async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const url = `${API_BASE}/poze-redoze?$filter=business_date eq '${dateStr}'&$first=100`;

    const response = await fetch(url);
    expect(response.ok).toBe(true);

    const { value } = await response.json();
    // Normally 96 fifteen-minute records; a DST changeover day has fewer/more.
    expect(value.length).toBeGreaterThanOrEqual(92);

    for (const record of value) {
      expect(record).toHaveProperty('dtime_utc');
      // Values may legitimately be null when no redispatch applies.
      expect(record).toHaveProperty('pv_red_network');
      expect(record).toHaveProperty('wi_red_balance');
    }
  });
});
