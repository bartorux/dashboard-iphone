import { PSEDataPoint } from '../types';

/**
 * Shared builder for data points in tests. Centralised on purpose: every field
 * added to PSEDataPoint used to break each inline literal separately.
 */
export function makePoint(overrides: Partial<PSEDataPoint> = {}): PSEDataPoint {
  return {
    time: new Date('2026-08-03T01:00:00Z'),
    timeStr: '2026-08-03 01:00:00',
    businessDate: '2026-08-03',
    period: '00 - 01',
    hourLabel: '00:00',
    endLabel: '01:00',
    reserve: 2000,
    required: 1000,
    demand: 14000,
    pv: 3000,
    wind: 2000,
    outages: 2500,
    exchange: -500,
    generation: 14500,
    ...overrides,
  };
}
