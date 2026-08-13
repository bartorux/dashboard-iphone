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
import { spokenDay, weekdayOf } from './dateHelpers';
import { visibleBusinessDates } from './dayWindow';
import { DEFAULT_RED_THRESHOLD } from './constants';
import { Standing, marginDistribution, standingFor } from './history';
import { describeDrivers, explainHour, generationNorms } from './generationNorm';

export interface DayFacts {
  /** PSE's own label for the day, "YYYY-MM-DD". */
  businessDate: string;
  /** Short Polish weekday, e.g. "pon.". */
  weekday: string;
  /**
   * How to say the day out loud without it meaning two others.
   *
   * A bare weekday name only works inside the current week, and this window
   * spans five WORKING days — so from midweek it reaches over the weekend. The
   * card published "W poniedziałek o 20:00" about a day six days out and it was
   * read as today. Settled in code, so the model copies a name rather than
   * choosing one.
   */
  spokenName: string;
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
  /**
   * What made the day's hardest hour hard, in words — or null when nothing in
   * the mix stands out and there is therefore nothing to explain.
   *
   * The clause is finished here rather than in the prompt, like every other
   * conclusion on this path: the model is given the comparison, never the two
   * numbers to compare.
   */
  drivers: string | null;
  /**
   * Where the day's hardest hour sits against the same hour over 30 days.
   *
   * Separate from `belowTypical`/`aboveTypical`, which count hours across the
   * whole day and say nothing about the one hour being discussed. Without it the
   * middle line had exactly one fact to work with and came back as a
   * transcription of it; this is the second, genuinely different thing that can
   * be said about the same hour — that being the tightest hour of the week does
   * not by itself make it unusual.
   */
  worstStanding: Standing;
}

/**
 * How thin a positive margin has to be to count as close. Uses the app's own
 * default alarm threshold so both readings come from one figure.
 *
 * The generator runs on a schedule for everybody, so it cannot see any one
 * person's saved thresholds — this is deliberately the default, not a setting.
 */
export const NEAR_THRESHOLD_MW = DEFAULT_RED_THRESHOLD;

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
  /**
   * Which days to describe. Defaults to exactly the days the tabs offer.
   *
   * It used to be a count, and the first N days chronologically are not the same
   * set: with a five-working-day strip that silently pulled in the weekend the
   * tabs step over, so the summary would discuss a Saturday nobody could open.
   */
  days: string[] = visibleBusinessDates(now)
): DayFacts[] {
  const ahead = upcoming(allData, now);

  const byDay = new Map<string, PSEDataPoint[]>();
  for (const point of ahead) {
    const bucket = byDay.get(point.businessDate);
    if (bucket) bucket.push(point);
    else byDay.set(point.businessDate, [point]);
  }

  /*
   * Like compared with like: a working day against working days, a day off
   * against days off.
   *
   * Both bands used to be built from all thirty days at once, grouped by hour of
   * day alone. Measured on live data, that drags the 08:00 demand norm down by
   * 657 MW — weekend mornings are far quieter than weekday ones — against a
   * significance threshold of 300 MW. An ordinary Tuesday morning therefore came
   * out as "zapotrzebowanie powyżej normy", and the card blamed demand for an
   * hour where demand was doing nothing unusual.
   *
   * The margin band is less distorted, because the required reserve falls at the
   * weekend too and the subtraction cancels most of it — but still enough to
   * move 7.6% of the typical/below/above verdicts.
   *
   * Not narrowed to the same weekday: thirty days hold about four Mondays, and
   * four samples cannot carry a 10th and 90th percentile. Working days leave 22.
   */
  const byType = (working: boolean) =>
    history.filter((point) => isWorkingDay(point.businessDate) === working);

  const distributions = {
    true: new Map(
      marginDistribution(byType(true)).map((hour) => [hour.hourLabel, hour])
    ),
    false: new Map(
      marginDistribution(byType(false)).map((hour) => [hour.hourLabel, hour])
    ),
  };

  // Empty unless the caller fetched history with the mix — the browser does not,
  // and nothing here needs it to. Then every lookup misses and no day carries a
  // cause, which is the same as before this existed.
  const normsByType = {
    true: generationNorms(byType(true)),
    false: generationNorms(byType(false)),
  };

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([businessDate]) => days.includes(businessDate))
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
      const risk = worstRisk(ranges, points, now);

      const workingDay = isWorkingDay(businessDate);
      const distribution = distributions[`${workingDay}`];
      const norms = normsByType[`${workingDay}`];

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
        spokenName: spokenDay(businessDate, now),
        workingDay,
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
        risk,
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
        // Worked out for the hour the facts actually name, and for no other. The
        // reason a day gets a hard hour is only interesting where there is a
        // hard hour; computing it everywhere would put a cause under days that
        // have no effect to explain.
        drivers: worst
          ? describeDrivers(
              explainHour(worst.point, norms.get(worst.point.hourLabel)),
              // On a day the regulation has nothing to say about, the 30-day
              // standing printed beneath already carries the "but".
              risk !== 'none'
            )
          : null,
        worstStanding: worst
          ? standingFor(worst.margin, distribution.get(worst.point.hourLabel))
          : 'unknown',
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
  const days = facts
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

  /*
   * The cause travels with the fingerprint, or a corrected cause never reaches
   * the card.
   *
   * Everything above describes what the facts were before the cause layer
   * existed: margin, hour, verdict, ranges, band counts. So when only the reason
   * changed — because the mix shifted while the margin held, or because we
   * corrected how it is computed — the stored text stayed, and the card went on
   * publishing an explanation the code no longer produced. That is not
   * hypothetical: after the 30-day audit the card still read "zapotrzebowanie
   * wzrośnie wyraźnie powyżej normy" while the facts had come to say
   * "zapotrzebowanie typowe", a word the code can no longer even emit.
   *
   * Only the leading day's, and only once. The other days' causes never reach
   * the text, so fingerprinting them would rewrite the summary over sentences
   * nobody would have read. Against its own band a driver stands out in about
   * one hour in four, so most runs carry "nic nie odstaje" here and the key
   * stays as still as it was.
   */
  const lead = leadingDay(facts);
  const cause = lead ? `${lead.drivers ?? '-'}/${lead.worstStanding}` : '-';

  return `${days}#${cause}`;
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
function stillAnnounceable(day: DayFacts): boolean {
  return day.ranges.some((range) => range.announceable);
}

/** The gravest verdict among a set of days, if any of them carries one. */
function gravest(days: DayFacts[]): DayFacts | undefined {
  return (
    days.find((day) => day.risk === 'high') ??
    days.find((day) => day.risk === 'moderate')
  );
}

/**
 * The one day the summary is really about.
 *
 * Shared with `keyPoint` so the text cannot lead with one day while the cause
 * beneath it explains another. The order is the same: what is still open and
 * grave, then a narrow margin, and failing both the tightest day in the window —
 * on a calm week that last one is the only day with anything to say about it.
 *
 * Exactly one day is chosen, and that is the point. Handing every day its own
 * cause is how the middle line came back four times today as a list.
 */
export function leadingDay(facts: DayFacts[]): DayFacts | null {
  const risky = gravest(facts.filter(stillAnnounceable)) ?? gravest(facts);
  if (risky) return risky;

  const near = facts.find((day) => day.nearThreshold > 0);
  if (near) return near;

  const measured = facts.filter((day) => day.worstMargin !== null);
  if (measured.length === 0) return null;

  return measured.reduce((tightest, day) =>
    (day.worstMargin as number) < (tightest.worstMargin as number) ? day : tightest
  );
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
  const worst = gravest(facts.filter(stillAnnounceable)) ?? gravest(facts);

  if (worst) {
    // Matched to the verdict, not simply the earliest. Ranges come back in
    // chronological order, so a day carrying a milder range in the morning and
    // the worst one in the evening announced the evening's verdict over the
    // morning's hours — the right label bolted to the wrong time.
    //
    // Among ranges of that verdict, one still open to a declaration wins, for
    // the same reason the day did.
    const matching = worst.ranges.filter((entry) => entry.risk === worst.risk);
    const range =
      matching.find((entry) => entry.announceable) ??
      matching[0] ??
      worst.ranges[0];

    return (
      `NAJWAŻNIEJSZE: ${worst.spokenName} — ${RISK_SHORT[worst.risk]}` +
      (range ? ` w godzinach ${range.from}-${range.to}` : '')
    );
  }

  /*
   * A day nobody can vouch for outranks a narrow margin, and outranks silence
   * altogether. "W żadnym z dni nie ma podstaw" used to be said flatly here even
   * when one of the days carried no readings at all — the most reassuring
   * sentence in the app, about a day it had never seen.
   */
  const unknown = facts.filter((day) => day.risk === 'unknown');
  if (unknown.length > 0) {
    const dni = unknown
      .map((day) => day.spokenName)
      .join(', ');
    // "na", not "dla": the day names are now spoken forms, and "dla jutro" is
    // not Polish. "na jutro", "na czwartek", "na poniedziałek 17 sierpnia" all
    // take the same case and read correctly.
    return `NAJWAŻNIEJSZE: na ${dni} brakuje odczytów, więc nie wiadomo, czy są podstawy do przywołania`;
  }

  const near = facts.find((day) => day.nearThreshold > 0);
  if (near && near.nearestHour) {
    // `worstHour` is the lowest margin of the whole day, which may fall at night
    // or carry a deficit — neither of which this sentence is about. The hour
    // named is the tightest among those it actually covers.
    return (
      `NAJWAŻNIEJSZE: w żadnym z dni nie ma podstaw do przywołania, ale ` +
      `${near.spokenName} o ${near.nearestHour} margines ` +
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
  const lead = leadingDay(facts);

  /*
   * Every day the same, and `keyPoint` has already said so for the whole window.
   * Only then is the per-day verdict pure repetition; a single 'unknown' day
   * makes each line carry something again, so the collapse is off.
   */
  const allClear = facts.every((day) => day.risk === 'none');

  for (const day of facts) {
    lines.push(
      `${day.businessDate} (${day.spokenName}${day.workingDay ? ', roboczy' : ', wolny'}), ` +
        `godzin pozostało: ${day.hoursAhead}`
    );

    /*
     * Whether this day's hardest hour is worth putting in front of the model at
     * all. Read twice below — for the hour and for its cause — so it is decided
     * once here rather than kept in step in two places.
     *
     * The leading day always qualifies, even on a calm week. The rule this
     * relaxes was written when EVERY day handed over an hour and the middle line
     * came back as a list of four; one hour, on the one day the text is about,
     * is not a list — and on a quiet week it is the only concrete thing there is
     * to say.
     */
    const isLead = lead?.businessDate === day.businessDate;
    const worthNaming = day.risk !== 'none' || day.nearThreshold > 0 || isLead;

    if (day.worstMargin !== null) {
      /*
       * The hour is named only when it means something.
       *
       * On a day with no grounds and no narrow margin, the lowest hour is not a
       * hard hour — at +1821 MW the whole day is comfortable and singling one
       * out invites the reader to look at nothing. That was harmless while the
       * summary covered three days. At five it stopped being harmless: every
       * day handed the model an hour, and the DALEJ line came back as a list of
       * four of them, each one copied straight from these lines.
       *
       * Removing the temptation rather than forbidding it, which is what worked
       * when the model kept reaching for words this prompt had shown it.
       */
      lines.push(
        `  najniższy margines ${round(day.worstMargin)}` +
          (worthNaming ? ` o ${day.worstHour}` : '') +
          (day.averageMargin !== null ? `, średni margines ${round(day.averageMargin)}` : '')
      );
    }

    /*
     * Said once for the window, or once per day — never both.
     *
     * On a calm week this line was identical five times over, and `keyPoint`
     * said the same thing a sixth time at the top. Opening the middle line of
     * the answer while that was true produced exactly what the material invited:
     * the model wrote "nie ma podstaw do przywołania" in TREŚĆ and again in
     * DALEJ, and never reached the one line that carried something new.
     *
     * Counted before removing it: the phrase reached the model seven times, the
     * cause once. This is the same fix that worked four times today — take away
     * what is being copied instead of forbidding the copy.
     */
    if (!allClear) lines.push(`  stan: ${RISK_WORD[day.risk]}`);

    /*
     * The cause, for the leading day and no other.
     *
     * Restricted to one day on purpose. Every day's mix deviates from its own
     * norm somehow, so offering all five would hand the model five causes and
     * invite it to recite them — the failure this prompt has already been fixed
     * for four times. One cause, attached to the day the text is already about,
     * cannot become a list.
     */
    if (isLead && day.drivers) {
      lines.push(`    dlaczego akurat ta godzina: ${day.drivers}`);

      /*
       * The second thing worth saying about the same hour, and the one that
       * stops the middle line being a transcription of the first: tightest of
       * the week and entirely ordinary for the time of day are both true at
       * once, and only the pair of them describes the evening honestly.
       *
       * Anchored on the hour by name, and worded without saying "godzina" twice.
       * The line used to read "sama ta godzina wypada w typowym zakresie dla tej
       * godziny…" — my own repetition, duly copied — and worse, the model
       * attached "sama ta godzina" to a three-hour range it had just named. The
       * standing is computed for ONE hour, so the facts now say which.
       */
      const STANDING_WORD: Record<Standing, string | null> = {
        below: `niższy niż zwykle o tej porze`,
        typical: `typowy jak na tę porę`,
        above: `wyższy niż zwykle o tej porze`,
        unknown: null,
      };
      const standing = STANDING_WORD[day.worstStanding];
      if (standing && day.worstHour) {
        lines.push(
          `    margines o ${day.worstHour} jest ${standing}, na tle ostatnich ${days} dni`
        );
      }
    }

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
