import { describe, it, expect } from 'vitest';
import {
  formatDateTimeApi,
  parsePseUtc,
  formatHourLabel,
  addDays,
  periodStart,
  periodEnd,
} from '../dateHelpers';

describe('formatDateTimeApi', () => {
  it('emits the format the PSE $filter expects, with leading zeros', () => {
    expect(formatDateTimeApi(new Date(2026, 7, 3, 1))).toBe(
      '2026-08-03 01:00:00'
    );
    expect(formatDateTimeApi(new Date(2026, 0, 9, 0))).toBe(
      '2026-01-09 00:00:00'
    );
  });
});

describe('parsePseUtc', () => {
  it('parses the space-separated UTC stamp without relying on Date parsing', () => {
    const d = parsePseUtc('2025-10-25 23:00:00');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2025-10-25T23:00:00.000Z');
  });

  it('returns null for junk rather than an Invalid Date', () => {
    // new Date('...') would yield Invalid Date here and NOT throw, so the old
    // try/catch never fired and "Invalid Date" leaked into the UI
    for (const bad of ['', 'nonsense', '2025-13-45 99:00:00', '03a']) {
      expect(parsePseUtc(bad)).toBeNull();
    }
  });
});

describe('formatHourLabel', () => {
  it('reads the hour straight from the PSE stamp, without Date parsing', () => {
    expect(formatHourLabel('2026-08-03 14:00:00')).toBe('14:00');
    expect(formatHourLabel('2026-08-03 00:00:00')).toBe('00:00');
  });

  it('keeps the DST duplicated hour readable', () => {
    // PSE emits a literal "03a" hour on the autumn switch day — unparseable as a Date
    expect(formatHourLabel('2025-10-26 03a:00:00')).toBe('03a:00');
  });

  it('falls back to the input instead of printing "Invalid Date"', () => {
    expect(formatHourLabel('nonsense')).toBe('nonsense');
  });
});

describe('addDays', () => {
  it('does not drift across the spring DST switch', () => {
    // 2026-03-29 is 23 hours long; naive +24h arithmetic lands on the wrong hour
    const d = addDays(new Date(2026, 2, 28), 2);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(0);
  });

  it('does not drift across the autumn DST switch', () => {
    const d = addDays(new Date(2025, 9, 25), 2);
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(0);
  });
});

describe('periodStart / periodEnd', () => {
  it('reads both ends of an ordinary period', () => {
    expect(periodStart('19 - 20')).toBe('19');
    expect(periodEnd('19 - 20')).toBe('20');
    expect(periodStart('00 - 01')).toBe('00');
  });

  it('renders the closing period as 00, not 24', () => {
    expect(periodStart('23 - 24')).toBe('23');
    expect(periodEnd('23 - 24')).toBe('00');
  });

  it('keeps the duplicated hour of the autumn switch distinguishable', () => {
    expect(periodStart('03 - 03a')).toBe('03');
    expect(periodEnd('03 - 03a')).toBe('03a');
    expect(periodStart('03a - 04')).toBe('03a');
    expect(periodEnd('03a - 04')).toBe('04');
  });

  it('returns null for anything it cannot parse', () => {
    for (const bad of ['', 'nonsense', '19-20', '19 -', ' - 20']) {
      expect(periodStart(bad)).toBeNull();
      expect(periodEnd(bad)).toBeNull();
    }
  });
});
