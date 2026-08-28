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
  /** Dispatchable generation scheduled by the TSO. */
  fcst_gen_unit_stor_prov?: string | number | null;
  /** Non-dispatchable generation. */
  fcst_gen_unit_stor_non_prov?: string | number | null;
}

/**
 * A row from pdgsz, PSE's Kompas Energetyczny (Energy Compass). usage_fcst is
 * the recommended-usage level for the period: 0 recommended use, 1 normal,
 * 2 recommended saving, 3 required limitation. Records are versioned —
 * is_active=true marks the current version of a given period.
 */
export interface PSECompassRawItem {
  business_date: string;
  dtime: string;
  dtime_utc: string;
  usage_fcst: number | string;
  is_active: boolean;
  publication_ts_utc?: string;
  total_power_demand?: string | number | null;
}

/**
 * A row from poze-redoze, non-market redispatch of renewables (PV/wind).
 * Values are in MW and NEGATIVE, or null when no redispatch applies to that
 * period. 96 fifteen-minute records per business day.
 */
/**
 * pdgobpkd — the CURRENT day's coordination plan. The one forecast field this
 * app reads from it is kse_pow_dem: demand of the WHOLE country, prosumer
 * self-consumption included — the honest denominator for an OZE share, unlike
 * grid_demand_fcst on pk5l-wp. Published for the current business date only;
 * future days return no rows, which is normal.
 */
export interface PSEKseDemandRawItem {
  business_date: string;
  dtime_utc: string;
  kse_pow_dem?: string | number | null;
}

export interface PSERedispatchRawItem {
  business_date: string;
  dtime: string;
  dtime_utc: string;
  period?: string;
  pv_red_network?: string | number | null;
  pv_red_balance?: string | number | null;
  wi_red_network?: string | number | null;
  wi_red_balance?: string | number | null;
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
  /**
   * Total forecast generation. Verified across 792 hours to within 1 MW:
   * generation + exchange = demand.
   */
  generation: number | null;
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
  /** Hour at which that worst margin occurs, e.g. "20:00". */
  worstHour: string;
  reserve: number;
  required: number;
  hours: number;
}

export interface Settings {
  orangeThreshold: number;
  redThreshold: number;
  version: number;
}

/**
 * Days from today. Not a union of 0|1|2 any more: the window skips days off,
 * so the offsets it offers are not contiguous and stepping through them means
 * walking the list from `visibleDayOffsets`, never adding one to an offset.
 */
export type DayOffset = number;

export type InstallableState = true | 'ios' | 'manual' | false;

/** Overall system state shown in the header and the "now" card. */
export type SystemStatus = 'ok' | 'warn' | 'alarm' | 'unknown';
