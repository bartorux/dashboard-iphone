import { PSEDataPoint } from '../types';
import {
  CallPeriodRange,
  CallPeriodRisk,
  callPeriodRanges,
  isEligibleHour,
  isWorkingDay,
  upcoming,
  worstRisk,
} from './callPeriod';
import { DEFAULT_RED_THRESHOLD } from './constants';
import { marginDistribution, standingFor } from './history';

export interface DayFacts {
  /** PSE's own label for the day, "YYYY-MM-DD". */
  businessDate: string;
  /** Short Polish weekday, e.g. "pon.". */
  weekday: string;
  workingDay: boolean;
  /** Blocks still ahead on this day. Zero means the day is spent. */
  hoursAhead: number;
  worstMargin: number | null;
  worstHour: string | null;
  averageMargin: number | null;
  risk: CallPeriodRisk;
  ranges: CallPeriodRange[];
  /** Hours ahead sitting below their own 30-day typical band. */
  belowTypical: number;
  /**
   * Hours ahead sitting above it. Counted too, because reporting only the
   * downside describes a day with an unusually large cushion as thoroughly
   * ordinary — the same asymmetry already fixed once in the history chart.
   */
  aboveTypical: number;
  /**
   * Hours where the reserve still covers what is required, but only just.
   *
   * There is no call period here — that needs the reserve to fall *below* the
   * requirement — yet the alert panel will be showing an alarm for the very same
   * hour, and a card flatly reporting "no grounds" next to it reads as a
   * contradiction. Reported as a fact so the summary can say "close" in words,
   * without inventing a risk level the regulations do not have.
   */
  nearThreshold: number;
}

/**
 * How thin a positive margin has to be to count as close. Uses the app's own
 * default alarm threshold so both readings come from one figure.
 *
 * The generator runs on a schedule for everybody, so it cannot see any one
 * person's saved thresholds — this is deliberately the default, not a setting.
 */
export const NEAR_THRESHOLD_MW = DEFAULT_RED_THRESHOLD;

const weekdayFormat = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'short',
  timeZone: 'UTC',
});

function weekdayOf(businessDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
  if (!match) return '';
  const [, year, month, day] = match;
  return weekdayFormat.format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  );
}

function countStanding(
  margins: Array<{ point: PSEDataPoint; margin: number }>,
  distribution: Map<string, ReturnType<typeof marginDistribution>[number]>,
  wanted: 'below' | 'above'
): number {
  return margins.filter(
    (entry) =>
      standingFor(entry.margin, distribution.get(entry.point.hourLabel)) ===
      wanted
  ).length;
}

function marginOf(point: PSEDataPoint): number | null {
  if (point.reserve === null || point.required === null) return null;
  return point.reserve - point.required;
}

/**
 * Facts for the days still ahead, computed here so the language model receives
 * conclusions rather than data. Nothing it returns carries a number, so nothing
 * it returns can be wrong about one.
 *
 * Days are taken from the data's own `businessDate` rather than from the clock:
 * that is PSE's label for the day and no local timezone can shift it. A day with
 * no hours left simply does not appear.
 */
export function buildFacts(
  allData: PSEDataPoint[],
  history: PSEDataPoint[],
  now: Date,
  maxDays = 3
): DayFacts[] {
  const ahead = upcoming(allData, now);

  const byDay = new Map<string, PSEDataPoint[]>();
  for (const point of ahead) {
    const bucket = byDay.get(point.businessDate);
    if (bucket) bucket.push(point);
    else byDay.set(point.businessDate, [point]);
  }

  const distribution = new Map(
    marginDistribution(history).map((hour) => [hour.hourLabel, hour])
  );

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, maxDays)
    .map(([businessDate, points]) => {
      const margins = points
        .map((point) => ({ point, margin: marginOf(point) }))
        .filter(
          (entry): entry is { point: PSEDataPoint; margin: number } =>
            entry.margin !== null
        );

      const worst = margins.reduce<{ point: PSEDataPoint; margin: number } | null>(
        (lowest, entry) =>
          lowest === null || entry.margin < lowest.margin ? entry : lowest,
        null
      );

      const ranges = callPeriodRanges(points, now);

      return {
        businessDate,
        weekday: weekdayOf(businessDate),
        workingDay: isWorkingDay(businessDate),
        hoursAhead: points.length,
        worstMargin: worst?.margin ?? null,
        worstHour: worst?.point.hourLabel ?? null,
        averageMargin:
          margins.length > 0
            ? Math.round(
                margins.reduce((sum, entry) => sum + entry.margin, 0) /
                  margins.length
              )
            : null,
        risk: worstRisk(ranges),
        ranges,
        belowTypical: countStanding(margins, distribution, 'below'),
        aboveTypical: countStanding(margins, distribution, 'above'),
        nearThreshold: margins.filter(
          (entry) =>
            isEligibleHour(entry.point) &&
            entry.margin >= 0 &&
            entry.margin < NEAR_THRESHOLD_MW
        ).length,
      };
    });
}

/**
 * Names the legal state, not a level of alarm.
 *
 * "High" and "moderate" were labels of mine and said nothing about what the
 * regulation actually provides for. What it provides for is when the operator
 * may REFRAIN from declaring: the surplus over grid demand staying at or above
 * 1100 MW, and the operator seeing no threat to covering demand — both together.
 * Below 1100 the first condition fails, so the grounds for refraining fall away
 * and a call period should follow. "Should", not "must": the rule governs when
 * declaring may be skipped rather than imposing the reverse obligation outright.
 *
 * The user's own alert thresholds are a separate, earlier layer — they say
 * something might be coming, not that anything is owed.
 */
const RISK_WORD: Record<CallPeriodRisk, string> = {
  high:
    'PRZYWOŁANIE POWINNO ZOSTAĆ OGŁOSZONE — nadwyżka spada poniżej progu, ' +
    'powyżej którego przepis pozwala przywołania nie ogłaszać, więc operator ' +
    'traci tę podstawę',
  // Named by what it does, not by a label. Handed "wartość regulacyjna", the
  // model coined "próg regulacyjny" — a term the regulation does not use and
  // which a reader can easily take for the required reserve, the one
  // distinction this whole card rests on.
  moderate:
    'OPERATOR MA PRAWO NIE OGŁASZAĆ — rezerwa nie pokrywa wymaganego poziomu, ' +
    'ale nadwyżka utrzymuje się powyżej progu, powyżej którego przepis pozwala ' +
    'przywołania nie ogłaszać. To UPRAWNIENIE operatora, nie prognoza — nie ' +
    'wiemy, jak z niego skorzysta',
  none: 'brak podstaw',
  unknown: 'nieznane',
};

/** The same states in a few words, for places where the full clause will not fit. */
const RISK_SHORT: Record<CallPeriodRisk, string> = {
  high: 'przywołanie powinno zostać ogłoszone',
  moderate: 'operator ma prawo nie ogłaszać',
  none: 'brak podstaw',
  unknown: 'nieznane',
};

const round = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)} MW`;

/**
 * A canonical string of everything the summary is actually about, used to decide
 * whether the text needs rewriting at all.
 *
 * Deliberately excludes `hoursAhead` and the average: both shift every single
 * hour as the day is consumed, so keying on them would mean the assessment never
 * looked unchanged and the model ran every hour regardless — which was the whole
 * thing this was meant to avoid. The worst margin is rounded for the same reason,
 * so a forecast nudged by a few megawatts does not count as news.
 *
 * Stored whole rather than hashed: it is short, and an exact comparison cannot
 * collide the way a hash can, where a collision would silently skip an update.
 */
export function assessmentKey(facts: DayFacts[]): string {
  return facts
    .map((day) =>
      [
        day.businessDate,
        day.workingDay ? 'R' : 'W',
        day.risk,
        day.worstMargin === null ? '-' : Math.round(day.worstMargin / 100) * 100,
        day.worstHour ?? '-',
        day.nearThreshold,
        day.belowTypical,
        day.aboveTypical,
        day.ranges
          .map((range) => `${range.risk}:${range.from}-${range.to}`)
          .join(','),
      ].join('|')
    )
    .join(';');
}

/**
 * The single most notable thing, worked out here rather than left to the model.
 *
 * Asked to pick it out of the facts itself, the model got the day wrong roughly
 * every other run — reporting a Tuesday evening as "today". Choosing which day
 * matters is reasoning, and reasoning belongs in code; the model is left with
 * wording, which is all it is reliable at.
 */
export function keyPoint(facts: DayFacts[]): string {
  const worst = facts.find((day) => day.risk === 'high')
    ?? facts.find((day) => day.risk === 'moderate');

  if (worst) {
    const range = worst.ranges[0];
    return (
      `NAJWAŻNIEJSZE: ${worst.weekday} ${worst.businessDate} — ${RISK_SHORT[worst.risk]}` +
      (range ? ` w godzinach ${range.from}-${range.to}` : '')
    );
  }

  const near = facts.find((day) => day.nearThreshold > 0);
  if (near && near.worstHour) {
    return (
      `NAJWAŻNIEJSZE: nigdzie nie ma podstaw do przywołania, ale ` +
      `${near.weekday} ${near.businessDate} o ${near.worstHour} margines ` +
      `zbliża się do granicy`
    );
  }

  return 'NAJWAŻNIEJSZE: w żadnym z dni nie ma podstaw do przywołania';
}

/**
 * The facts as a dozen or so lines of text. Deliberately not the PSE JSON: the
 * raw payload is both far larger and full of fields the assessment already
 * accounts for, so sending it would cost tokens to say less.
 */
export function renderFacts(facts: DayFacts[], days: number): string {
  if (facts.length === 0) return 'Brak danych o pozostałych godzinach.';

  const lines: string[] = [keyPoint(facts), ''];

  for (const day of facts) {
    lines.push(
      `${day.businessDate} (${day.weekday}${day.workingDay ? ', roboczy' : ', wolny'}), ` +
        `godzin pozostało: ${day.hoursAhead}`
    );

    if (day.worstMargin !== null) {
      lines.push(
        `  margines najniższy ${round(day.worstMargin)} o ${day.worstHour}` +
          (day.averageMargin !== null ? `, średni ${round(day.averageMargin)}` : '')
      );
    }

    lines.push(`  okres przywołania: ${RISK_WORD[day.risk]}`);

    for (const range of day.ranges) {
      lines.push(
        `    ${range.from}-${range.to} (${range.hours} godz.): ${RISK_WORD[range.risk]}`
      );
      // On its own line, and labelled. Sharing a line with the state clause, the
      // model read the two as cause and effect and wrote that the surplus
      // holding above the threshold was why a declaration might still come —
      // exactly backwards, since that is the reason one might not.
      //
      // Said plainly, without the "window" figure of speech this used to carry:
      // the model shortened it to "the window stays open" and dropped the only
      // part that explained what the window was.
      lines.push(
        range.announceable
          ? '      ogłoszenie może jeszcze nadejść (do tych godzin zostało ponad 8 godz. wymaganego wyprzedzenia)'
          : '      ogłoszenie już nie nadejdzie, jeśli dotąd nie padło (zostało mniej niż 8 godz. wymaganego wyprzedzenia)'
      );
    }

    if (day.nearThreshold > 0) {
      // Spelled out as OTHER hours. Left unscoped, this read as a denial of the
      // headline: one sentence said the reserve would not cover what is
      // required, the next that it does — both true, of different hours.
      //
      // No figure for the threshold on purpose: given one, the model wrote it
      // out in words and slipped straight past the ban on numbers.
      lines.push(
        `    OSOBNO, w INNYCH godzinach tego dnia: ${day.nearThreshold} godz. ` +
          `z wąskim, ale DODATNIM marginesem — tam rezerwa pokrywa wymagany ` +
          `poziom i nie ma podstaw do przywołania`
      );
    }

    if (day.belowTypical > 0) {
      lines.push(
        `  poniżej typowego zakresu z ${days} dni: ${day.belowTypical} godz.`
      );
    }
    if (day.aboveTypical > 0) {
      lines.push(
        `  powyżej typowego zakresu z ${days} dni: ${day.aboveTypical} godz.`
      );
    }
  }

  return lines.join('\n');
}
