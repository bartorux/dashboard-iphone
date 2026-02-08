export interface PSERawItem {
  plan_dtime: string;
  req_pow_res: string | number;
  surplus_cap_avail_tso?: string | number | null;
  avail_cap_gen_units_stor_prov?: string | number | null;
}

export interface PSEDataPoint {
  time: Date;
  timeStr: string;
  reserve: number | null;
  required: number | null;
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
