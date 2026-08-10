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
  /**
   * Hour of the tightest of those, or null when there are none.
   *
   * Separate from `worstHour`, which is the lowest margin of the whole day and
   * may fall at night or carry a deficit — hours this count deliberately
   * excludes, so naming one of them alongside it pointed at the wrong time.
   */
  nearestHour: string | null;
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

      // Hours that keep a positive margin but only just — and only those the
      // rules could apply to, so a night hour never turns up in a sentence
      // about working-day risk.
      const near = margins.filter(
        (entry) =>
          isEligibleHour(entry.point) &&
          entry.margin >= 0 &&
          entry.margin < NEAR_THRESHOLD_MW
      );

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
        nearThreshold: near.length,
        nearestHour:
          near.length > 0
            ? near.reduce((tightest, entry) =>
                entry.margin < tightest.margin ? entry : tightest
              ).point.hourLabel
            : null,
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
    'PRZYWOŁANIE POWINNO ZOSTAĆ OGŁOSZONE — nadwyżka spadła poniżej progu ' +
    '1100 MW. Dopóki go przekraczała, przepis pozwalał operatorowi nie ' +
    'ogłaszać przywołania; teraz operator traci tę podstawę',
  // Named by what it does, not by a label. Handed "wartość regulacyjna", the
  // model coined "próg regulacyjny" — a term the regulation does not use and
  // which a reader can easily take for the required reserve, the one
  // distinction this whole card rests on.
  moderate:
    'OPERATOR MA PRAWO NIE OGŁASZAĆ PRZYWOŁANIA — rezerwa nie pokrywa ' +
    'wymaganego poziomu, ale nadwyżka wciąż przekracza próg 1100 MW. ' +
    'To UPRAWNIENIE z przepisu, nie prognoza — nie wiadomo, czy operator ' +
    'z niego skorzysta',
  none: 'nie ma podstaw do przywołania',
  unknown: 'nie wiadomo, czy są podstawy do przywołania',
};

/** The same states in a few words, for places where the full clause will not fit. */
const RISK_SHORT: Record<CallPeriodRisk, string> = {
  high: 'przywołanie powinno zostać ogłoszone',
  moderate: 'operator ma prawo nie ogłaszać przywołania',
  none: 'nie ma podstaw do przywołania',
  unknown: 'nie wiadomo, czy są podstawy do przywołania',
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
/** A day still open to a declaration — somewhere in it, the notice period holds. */
function otwartyNaOgloszenie(day: DayFacts): boolean {
  return day.ranges.some((range) => range.announceable);
}

export function keyPoint(facts: DayFacts[]): string {
  /*
   * What can still change comes first.
   *
   * Picking purely by severity led the summary with a Monday evening whose
   * notice period had already lapsed — the next sentence said as much — while a
   * Wednesday the operator could still act on waited until the last line. For
   * someone asking whether they are about to be called, that is backwards: the
   * settled matter on top, the open one at the bottom.
   *
   * Severity still decides among the days that remain open, and a day whose
   * window has closed can still lead when no other qualifies. It never
   * disappears either way — the facts carry every day, so the model can mention
   * it regardless.
   */
  const otwarte = facts.filter(otwartyNaOgloszenie);
  const najgorszy = (dni: DayFacts[]) =>
    dni.find((day) => day.risk === 'high') ??
    dni.find((day) => day.risk === 'moderate');

  const worst = najgorszy(otwarte) ?? najgorszy(facts);

  if (worst) {
    // Matched to the verdict, not simply the earliest. Ranges come back in
    // chronological order, so a day carrying a milder range in the morning and
    // the worst one in the evening announced the evening's verdict over the
    // morning's hours — the right label bolted to the wrong time.
    //
    // Among ranges of that verdict, one still open to a declaration wins, for
    // the same reason the day did.
    const pasujace = worst.ranges.filter((entry) => entry.risk === worst.risk);
    const range =
      pasujace.find((entry) => entry.announceable) ??
      pasujace[0] ??
      worst.ranges[0];

    return (
      `NAJWAŻNIEJSZE: ${worst.weekday} ${worst.businessDate} — ${RISK_SHORT[worst.risk]}` +
      (range ? ` w godzinach ${range.from}-${range.to}` : '')
    );
  }

  const near = facts.find((day) => day.nearThreshold > 0);
  if (near && near.nearestHour) {
    // `worstHour` is the lowest margin of the whole day, which may fall at night
    // or carry a deficit — neither of which this sentence is about. The hour
    // named is the tightest among those it actually covers.
    return (
      `NAJWAŻNIEJSZE: w żadnym z dni nie ma podstaw do przywołania, ale ` +
      `${near.weekday} ${near.businessDate} o ${near.nearestHour} margines ` +
      `jest wąski, choć wciąż dodatni`
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
        `  najniższy margines ${round(day.worstMargin)} o ${day.worstHour}` +
          (day.averageMargin !== null ? `, średni margines ${round(day.averageMargin)}` : '')
      );
    }

    lines.push(`  stan: ${RISK_WORD[day.risk]}`);

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
          ? '      ogłoszenie może jeszcze nadejść — zostało więcej czasu, niż wynosi wymagane ośmiogodzinne wyprzedzenie'
          : '      na ogłoszenie jest już za późno — zostało mniej czasu, niż wynosi wymagane ośmiogodzinne wyprzedzenie'
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
        `    OSOBNO — poza powyższym zakresem tego dnia jest ` +
          `${day.nearThreshold} godz. z wąskim, ale DODATNIM marginesem: ` +
          `rezerwa pokrywa wymagany poziom i nie ma tam podstaw do przywołania`
      );
    }

    if (day.belowTypical > 0) {
      lines.push(
        `  margines poniżej typowego zakresu z ostatnich ${days} dni: ${day.belowTypical} godz.`
      );
    }
    if (day.aboveTypical > 0) {
      lines.push(
        `  margines powyżej typowego zakresu z ostatnich ${days} dni: ${day.aboveTypical} godz.`
      );
    }
  }

  return lines.join('\n');
}
