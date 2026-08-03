export interface PSERawItem {
  /** Local wall-clock end of the period. May contain a literal "03a" hour on DST days. */
  plan_dtime: string;
  /** Same instant in UTC — always parseable, so this is what we order by. */
  plan_dtime_utc: string;
  /** PSE business day the period belongs to, e.g. "2026-08-03". */
  business_date: string;
  /** Period label, e.g. "00 - 01" or "03 - 03a". */
  period: string;
  req_pow_res: string | number;
  surplus_cap_avail_tso?: string | number | null;
  avail_cap_gen_units_stor_prov?: string | number | null;

  /**
   * Context fields. Measured over 33 days, these explain the alarms almost
   * entirely: alarm hours average +4366 MW of demand and −4153 MW of PV output
   * against calm hours, and 73 of 92 fall between 17:00 and 23:00.
   */
  grid_demand_fcst?: string | number | null;
  fcst_pv_tot_gen?: string | number | null;
  fcst_wi_tot_gen?: string | number | null;
  sum_unav_oper_cond?: string | number | null;
  planned_exchange?: string | number | null;
}

export interface PSEDataPoint {
  /** Canonical instant, derived from plan_dtime_utc. */
  time: Date;
  /** Raw local stamp — unique per point, used as a React key and chart category. */
  timeStr: string;
  businessDate: string;
  /** Period label, e.g. "19 - 20". Empty for points synthesised to fill a gap. */
  period: string;
  /**
   * Hour the period STARTS, as "19:00" — this is what the user sees.
   * Deliberately not derived from `timeStr`: that carries the period end, and
   * showing it put every hour in the UI one hour later than reality.
   */
  hourLabel: string;
  /** Hour the period ends, as "20:00". Used for the closing edge of a range. */
  endLabel: string;
  reserve: number | null;
  required: number | null;

  /** Forecast demand for the block. */
  demand: number | null;
  /** Forecast photovoltaic generation. */
  pv: number | null;
  /** Forecast wind generation. */
  wind: number | null;
  /** Sum of capacity unavailable for operational reasons. */
  outages: number | null;
  /** Planned cross-border exchange; negative means export. */
  exchange: number | null;
}

export interface Alert {
  time: string;
  reserve: number;
  required: number;
  difference: number;
}

export interface AlertSet {
  orange: Alert[];
  red: Alert[];
}

/** Consecutive alert hours collapsed into one entry. */
export interface AlertRange {
  severity: 'red' | 'orange';
  /** Label of the first hour in the range, e.g. "17:00". */
  from: string;
  /** Label of the hour the range ends at, e.g. "20:00". */
  to: string;
  /** Worst (lowest) margin within the range. */
  worstDifference: number;
  reserve: number;
  required: number;
  hours: number;
}

export interface AlertHistory {
  orange: (Alert & { detectedAt: number })[];
  red: (Alert & { detectedAt: number })[];
  lastResetDate: string | null;
}

export interface Settings {
  orangeThreshold: number;
  redThreshold: number;
  disableUpdates: boolean;
  version: number;
}

export type DayOffset = 0 | 1 | 2;

export type InstallableState = true | 'ios' | 'manual' | false;

/** Overall system state shown in the header and the "now" card. */
export type SystemStatus = 'ok' | 'warn' | 'alarm' | 'unknown';
