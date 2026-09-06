/**
 * Contract between the generator (scripts/summary.ts writes data/badanie.json)
 * and the research subpage (src/components/Badanie.tsx reads it).
 *
 * This is a RESEARCH file, not the product. It exists to answer one question
 * with data rather than prose: what did this tool know, by the regulatory
 * deadline, on the days a call period (real or test) was actually declared —
 * and on the days one was not. One positive case so far (2026-09-02 20:00,
 * test). Everything here is a measurement to be judged, never a verdict.
 *
 * Nothing on the main screen reads this file. See docs/stan-prac.md.
 */

/** A call period the owner knows happened — typed in by hand, data/przywolania.json. */
export interface CallEvent {
  /** Business date, "YYYY-MM-DD". */
  date: string;
  /** Hour the block starts, 0-23 (20 = 20:00-21:00). */
  hour: number;
  /** Test periods are declared for one or many units; real ones for the whole market. */
  kind: 'test' | 'real';
  scope: 'unit' | 'market';
  note?: string;
}

/**
 * One measured feature: its raw value and where it sits against every other
 * day with a closed decision window. `percentile` is the share of OTHER days
 * that were LESS extreme (0 = mildest, 1 = the most extreme day on record),
 * with "extreme" always meaning "worse for the system" — a smaller headroom,
 * a longer dwell, a lower evening margin. `extreme` is `percentile >= 0.9`.
 *
 * Deliberately a rank, not a threshold: every threshold we could write today
 * would be fitted to a single event.
 */
export interface Feature {
  value: number | null;
  percentile: number | null;
  extreme: boolean;
}

/** One archived reading of the day's worst hour: [readAt ISO, surplus MW, required MW]. */
export type Reading = readonly [readAt: string, surplus: number, required: number];

export type Verdict =
  /** Feature count high AND an event is on record. */
  | 'trafienie'
  /** Feature count high, no event on record. */
  | 'falszywy-alarm'
  /** Event on record, features quiet. */
  | 'przeoczenie'
  /** Nothing on either side. */
  | 'cisza'
  /** Deadline not yet passed — the numbers may still move. */
  | 'otwarte';

export interface DayStudy {
  date: string;
  /**
   * The decision window: the last archived reading taken before the
   * regulatory deadline (worst hour minus NOTICE_HOURS, local time). `open`
   * when that deadline is still ahead — then `readAt` is simply the latest
   * reading and every feature is provisional.
   */
  window: { readAt: string | null; deadline: string | null; open: boolean };
  /** Hour (0-23) with the lowest surplus among blocks 12-23 at the window. */
  worstHour: number | null;
  surplus: number | null;
  required: number | null;
  margin: number | null;
  /** surplus − CALL_PERIOD_EXEMPTION_MW at the window; lower = worse. */
  headroom: Feature;
  /** Consecutive readings back from the window in which the worst hour stayed below DWELL_FLOOR_MW; higher = worse. */
  dwell: Feature;
  /** Margin of the worst hour in the last reading stamped on D-1 (local); lower = worse. */
  eveMargin: Feature;
  /** Kompas level for the worst hour in the pdgsz version active at the window; ≥2 counts as extreme. */
  compass: { level: 0 | 1 | 2 | 3 | null; extreme: boolean };
  /** How many of the four features are extreme, 0-4. */
  extremeCount: number;
  event: CallEvent | null;
  /** The owner's word on the day, when there is one — from the register or an issue. */
  observation: Observation | null;
  verdict: Verdict;
  /** Every archived reading of the worst hour, oldest first — the day's timeline. */
  readings: Reading[];
}

export interface BadanieFile {
  generatedAt: string;
  /** Regulatory notice, hours (mirrors NOTICE_HOURS in callPeriod.ts). */
  noticeHours: number;
  /** CALL_PERIOD_EXEMPTION_MW at generation time. */
  exemptionMw: number;
  /** Floor for the dwell count, MW. */
  dwellFloorMw: number;
  /** Feature count from which a day is called "alarm" for the verdict. */
  alarmFrom: number;
  days: DayStudy[];
  events: CallEvent[];
  /** Every observation the generator knew of, issues included, newest first. */
  observations: Observation[];
}

/**
 * One published version of one Kompas hour — every version, not only the
 * active one. The analysis picks, for each day's decision window, the
 * version whose `publishedAt` is the latest at or before the window's
 * `readAt`; that is what a reader of this tool could have seen at the time.
 * Produced by the Kompas archive (src/utils/kompasArchive.ts) and, until that
 * archive has history, by the versioned pdgsz endpoint.
 */
export interface CompassVersionRow {
  businessDate: string;
  /** Hour the block starts, 0-23, local. */
  hour: number;
  level: 0 | 1 | 2 | 3;
  /** PSE's publication_ts_utc as an ISO instant. */
  publishedAt: string;
}

/**
 * What the owner says actually happened on a day — including "nothing", which
 * is the observation the study needs most and the register cannot express.
 *
 * `none` means "nothing at OUR units": a test at another aggregator's unit is
 * invisible to the owner, so a `none` on an alarm day is an upper bound on the
 * false-alarm rate, never a proof of one. Market-wide real calls are seen by
 * everyone, so a `none` there is firm.
 */
export type Outcome = 'none' | 'test' | 'real';

export interface Observation {
  date: string;
  outcome: Outcome;
  /** Hour the block starts, 0-23; absent for `none`. */
  hour?: number;
  scope?: 'unit' | 'market';
  note?: string;
  /** Hand-kept register (data/przywolania.json) or a GitHub issue filed from the page. */
  source: 'register' | 'issue';
  issueNumber?: number;
}
