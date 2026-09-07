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

/**
 * One archived reading of the day's worst hour: [readAt ISO, surplus MW,
 * required MW, planned exchange MW]. Exchange is `null` when PSE published no
 * figure for that reading, and the fourth element is optional in the type
 * only so a reading serialized before this field existed still matches it —
 * every reading this module produces now carries one (possibly `null`).
 * Negative = export, positive = import, same sign convention as
 * `PSEDataPoint.exchange`.
 */
export type Reading = readonly [
  readAt: string,
  surplus: number,
  required: number,
  exchange?: number | null,
];

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
  | 'otwarte'
  /**
   * A test call period: the operator picks the hour regardless of the
   * system state (5/5 tests in 2026 confirm the rule), so the study neither
   * claims a hit nor a miss — the day is shown, scored, and kept out of the
   * tally.
   */
  | 'test';

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
  /** Hours the worst hour has sat below DWELL_FLOOR_MW, measured as the time span of the unbroken run ending at the window; higher = worse. */
  dwell: Feature;
  /** Margin of the worst hour in the last reading stamped on D-1 (local); lower = worse. */
  eveMargin: Feature;
  /**
   * Kompas across the WHOLE DAY, not just the worst hour: for every hour
   * 7-21, the pdgsz version active at that hour's OWN deadline (its start
   * minus NOTICE_HOURS) — see `compassForDay` in badanie.ts. `level` is the
   * highest of those; `hours` lists every hour that reached L2+, ascending;
   * `extreme` is `level >= 2`.
   *
   * WHY per-day and not per-target-hour: on the three real 2026 call periods
   * (30.06 18-21, 04.08 17-18, 06.08 17-21), the version active 8h ahead of
   * each CALLED hour was L2/L3 only on SOME of the called hours, never all —
   * 04.08 showed L2 at 17:00 but only L1 at 18:00; 06.08 showed L2 at
   * 17:00-18:00 but only L1 at 19:00-21:00. A flag scored on a single target
   * hour (the day's worst by reserve, which need not be the hour PSE
   * actually flagged) would have missed the L2 reading entirely on any day
   * where that particular hour drew L1. Scoring the day as extreme when ANY
   * hour 7-21 reached L2+ in ITS OWN window caught all three real call
   * periods; the alternative tried first — L2+ in ANY published version
   * regardless of timing — passed on 33 of 70 business days and was
   * useless as a signal.
   */
  compass: { level: 0 | 1 | 2 | 3 | null; extreme: boolean; hours: number[] };
  /** How many of the four features are extreme, 0-4. */
  extremeCount: number;
  /**
   * Every hour 7-21, other than the target hour, whose OWN decision window
   * (see `computeHourWindow` in badanie.ts) shows a negative margin — i.e.
   * hours that also looked tight the same day, not just the one that was
   * picked. Sorted by surplus ascending (worst first). Empty when nothing
   * else was tight, including when the day has no target hour at all.
   */
  tightHours: Array<{ hour: number; surplus: number; margin: number }>;
  event: CallEvent | null;
  /** The owner's word on the day, when there is one — from the register or an issue. */
  observation: Observation | null;
  verdict: Verdict;
  /** Every archived reading of the worst hour, oldest first — the day's timeline. */
  readings: Reading[];
  /**
   * Whether the CURRENT day-ahead forecast (`pk5l-wp`, as read when this file
   * was generated) already carries a real cross-border exchange for this
   * date, per `exchangePlanned` in exchangePlan.ts. `null` when the date is
   * not in that forecast at all — every closed day from the past, which the
   * forecast never reaches back to.
   *
   * WHY this matters: on 07.09.2026, today and tomorrow carried an
   * hourly-varying exchange (+1.9 to +3.3 GW of import in the evening peak),
   * while every day from D+2 on carried a flat placeholder (−12 MW, then 0) —
   * a reserve stated WITHOUT the import that later covers most of the evening
   * gap. 09.09 showed just 49 MW of reserve at 19:00 for exactly this reason.
   * The exchange for a day arrives on D−1 once the market clears, around
   * 13:00 (seen at 13:19 on 06.09, 13:59 on 01.09) — so a day still `false`
   * here is not yet wrong, only still waiting.
   */
  exchangePlanned: boolean | null;
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
