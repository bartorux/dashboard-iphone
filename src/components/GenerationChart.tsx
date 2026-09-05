import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { PSEDataPoint } from '../types';
import { HOUR_MS } from '../utils/constants';
import { niceScaleRange } from '../utils/scale';
import { hasCurtailment, RedispatchHour } from '../utils/redispatch';
import { renewableMixShare } from '../utils/renewableShare';
import { useChartColors } from '../hooks/useChartColors';
import {
  useChartAnimationMs,
  AXIS_FONT_SIZE,
  LABEL_FONT_SIZE,
  AreaSwatch,
  CHART_BOX,
  CHART_MARGIN,
  ChartLegend,
  ChartTooltipBox,
  LineSwatch,
  TooltipRow,
  axisWidthFor,
  formatMW,
  hourTicks,
  shortHour,
  useDismissibleTooltip,
} from './chart/shared';
import HourTable, { HourColumn } from './chart/HourTable';

interface GenerationChartProps {
  data: PSEDataPoint[];
  currentHourLabel: string | null;
  /**
   * Non-market curtailment of PV/wind, keyed by the UTC epoch ms the hourly
   * block STARTS at. Optional and presentational: this component only reads
   * it, `useRedispatch` does the fetching. Omitted or empty, the chart renders
   * exactly as it did before this existed.
   */
  redispatch?: Map<number, RedispatchHour>;
  /** Country-wide demand per hour start — the honest denominator for the OZE
   *  share. Present for the current day only (pdgobpkd publishes no future
   *  days), so the tooltip line appears on "Dziś" and honestly vanishes
   *  elsewhere. */
  kseDemand?: Map<number, number>;
}

interface Row {
  key: string;
  endLabel: string;
  demand: number | null;
  pv: number | null;
  wind: number | null;
  outages: number | null;
  exchange: number | null;
  /**
   * Generation of GRID units only (fcst_gen_unit_stor_prov + non_prov) — it
   * balances grid demand plus exchange to the megawatt. PV and wind above are
   * TOTALS, micro-installations included, and those never appear here: a
   * prosumer's panel shows up as lowered grid demand instead. Measured on
   * 27.08.2026 noon: total KSE demand 20.2 GW vs grid demand 13.2 GW — a ~7 GW
   * gap of behind-the-meter PV.
   *
   * This is why there is no "Pozostałe" band any more. It was computed as
   * generation − PV − wind across those two incompatible frames, which
   * understated conventional sources by the whole prosumer volume and put a
   * 93% OZE share on screen. The negative remainder the old code clamped in 4
   * of 792 hours was this bug showing itself.
   */
  generation: number | null;
  /**
   * PV's own value, but only on hours where PV > 0 — null everywhere else,
   * including the many null-or-zero night hours. Feeds the seam Lines below,
   * which draw a 2px surface gap between the solar and wind bands. Keeping
   * `pv` itself unchanged (still drawn as the stacked Area at 0 through the
   * night) and introducing this second field is what lets the seam and the
   * area disagree about the night — see the seam Lines' own comment for why
   * they must.
   */
  pvSeam: number | null;
  /**
   * MW curtailed this hour by PSE order, <= 0. Null means the day's
   * redispatch data has not loaded (or does not exist yet) — nothing is
   * drawn. Zero means it loaded and there was nothing curtailed that hour.
   */
  pvRed: number | null;
  windRed: number | null;
  /** Country-wide demand for this hour, or null when not published. */
  kseDemand: number | null;
}

/**
 * The redispatch bucket for one row, keyed on the hour the block STARTS —
 * `point.time` carries its END (see the field comment on `PSEDataPoint`), so
 * joining on `point.time` directly would attribute an hour's curtailment to
 * the row after it. Exported so this one line of arithmetic — easy to get
 * backwards, and wrong in a way no screenshot would catch — has its own test
 * independent of rendering.
 */
export function redispatchForPoint(
  point: PSEDataPoint,
  redispatch: Map<number, RedispatchHour> | undefined
): { pvRed: number | null; windRed: number | null } {
  const bucket = redispatch?.get(point.time.getTime() - HOUR_MS);
  return {
    pvRed: bucket ? bucket.pvRed : null,
    windRed: bucket ? bucket.windRed : null,
  };
}

/**
 * Widths for the two grid-frame lines, and the surface halo painted under
 * each. They are constants because the relationship between the three numbers
 * is the design — demand heavier than generation, and the casing wide enough
 * to clear both by about a pixel on each side.
 */
const DEMAND_WIDTH = 2.75;
const GENERATION_WIDTH = 1.75;
const CASING = 3;
/** The stroke every OZE area already draws on its own edge. */
const PV_EDGE = 1.5;

/** Long enough to read as a deliberate dash at phone width, not as a texture. */
const GENERATION_DASH = '6 4';

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: Row }>;
}

/** Exported for the test that renders it directly — on hover-only UI a
 * chart-level assertion can never see what the tooltip prints. */
export const GenerationTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  if (row.demand === null) {
    return (
      <ChartTooltipBox>
        <div className="font-semibold text-text">{String(label)}</div>
        <div className="text-text-tertiary">Brak danych</div>
      </ChartTooltipBox>
    );
  }

  const pv = row.pv ?? 0;
  const wind = row.wind ?? 0;
  const generation = row.generation;
  const exchange = row.exchange ?? 0;
  const pvRed = row.pvRed ?? 0;
  const windRed = row.windRed ?? 0;
  const showRedispatch = pvRed !== 0 || windRed !== 0;

  /**
   * "OZE w krajowym miksie", computed by the one shared formula (see
   * renewableShare.ts) rather than inline here — RenewableMixCard needs the
   * exact same arithmetic and a second copy is how the two would drift.
   *
   * The previous version divided by kseDemand alone and read 83% at this
   * same hour — arithmetically fine, but it reads as "how much of the
   * COUNTRY's consumption runs on renewables," which overstates it whenever
   * Poland is exporting: those MW left before anyone consumed them. Against
   * the mix actually available to consume domestically, the honest share at
   * this same hour is 67%.
   *
   * All four inputs are required — pv/wind and kseDemand/exchange (the
   * latter pair published for the current day only) — so a null on any one
   * means no line, never a silent fallback.
   */
  const mixShare = renewableMixShare(row.pv, row.wind, row.kseDemand, row.exchange);

  return (
    <ChartTooltipBox>
      <div className="mb-1 font-semibold text-text">
        {String(label)}&ndash;{row.endLabel}
      </div>
      <dl className="space-y-0.5">
        {/* Totals and grid figures kept apart, no percentage across them: PV
            and wind include micro-installations, grid generation does not, and
            a share computed across those two frames is how a 93% OZE figure
            reached the screen.

            "(całk.)" and "(sieć)" are now a matched pair of qualifiers rather
            than one abbreviation and one adjective. The frame is the thing a
            reader has to notice before comparing any two of these rows, and a
            parallel marker is what makes it noticeable — the divider alone
            only said "these are different", not how. */}
        <TooltipRow label="Fotowoltaika (całk.)" value={`${formatMW(pv)} MW`} />
        <TooltipRow label="Wiatr (całk.)" value={`${formatMW(wind)} MW`} />
        {/* The easy figure, with an honest denominator on both counts: total
            OZE (never GRID generation — see the frame-of-reference comment
            below), over demand adjusted for exchange rather than demand
            alone (see renewableMixShare above). Both kseDemand and exchange
            are published for the current day only, so the line appears on
            "Dziś" and honestly disappears — never a silent fallback —
            wherever either is missing. */}
        {mixShare !== null && (
          <TooltipRow label="OZE w krajowym miksie" value={`${mixShare}%`} />
        )}
        <TooltipRow
          label="Generacja (sieć)"
          value={generation === null ? 'brak' : `${formatMW(generation)} MW`}
          divider
        />
        <TooltipRow
          label="Zapotrzebowanie (sieć)"
          value={`${formatMW(row.demand)} MW`}
        />
        <TooltipRow
          label="Wymiana"
          value={`${exchange > 0 ? 'import ' : 'eksport '}${formatMW(
            Math.abs(exchange)
          )} MW`}
        />
        <TooltipRow label="Ubytki mocy" value={`${formatMW(row.outages ?? 0)} MW`} />
        {showRedispatch && (
          <>
            <TooltipRow
              label="Redysponowanie OZE"
              value={`${formatMW(pvRed + windRed)} MW`}
              divider
            />
            <TooltipRow indent label="fotowoltaika" value={`${formatMW(pvRed)} MW`} />
            <TooltipRow indent label="wiatr" value={`${formatMW(windRed)} MW`} />
          </>
        )}
      </dl>
    </ChartTooltipBox>
  );
};

/**
 * Why the margin moves. Measured over 33 days, alarm hours carry +4366 MW of
 * demand and −4153 MW of PV output against calm hours, and 73 of 92 fall
 * between 17:00 and 23:00 — the evening peak meeting the end of daylight.
 *
 * Outages are deliberately not plotted: they differ by only −110 MW between
 * alarm and calm hours, so drawing them would add a line that explains nothing.
 * They stay in the tooltip.
 */
/**
 * The figures behind the generation view.
 *
 * Five columns, and no more: demand, the two renewable series the stack is
 * made of, grid generation and exchange. Curtailment and outages stay in the
 * tooltip — they are a footnote on the plot and would be a footnote here too,
 * at the cost of two more columns to scroll past on a phone.
 *
 * No tone on any column. Nothing on this view is a threshold: these are
 * quantities, not judgements, and colouring them would invent a status the
 * chart itself does not claim.
 */
const GENERATION_COLUMNS: HourColumn<Row>[] = [
  { header: 'Godz.', value: (row) => `${row.key}–${row.endLabel}` },
  { header: 'Zapotrz.', value: (row) => (row.demand === null ? '—' : formatMW(row.demand)) },
  { header: 'PV', value: (row) => (row.pv === null ? '—' : formatMW(row.pv)) },
  { header: 'Wiatr', value: (row) => (row.wind === null ? '—' : formatMW(row.wind)) },
  {
    header: 'Generacja',
    value: (row) => (row.generation === null ? '—' : formatMW(row.generation)),
  },
  {
    header: 'Wymiana',
    value: (row) =>
      row.exchange === null ? '—' : `${row.exchange > 0 ? '+' : ''}${formatMW(row.exchange)}`,
  },
];

const GenerationChart: React.FC<GenerationChartProps> = ({
  data,
  currentHourLabel,
  redispatch,
  kseDemand,
}) => {
  const animationMs = useChartAnimationMs();

  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

  /**
   * Area fills on this view are a wash, not a block.
   *
   * The stack used to be filled at 0.55 in both hues, and at that weight two
   * saturated slabs covering half the plot outweighed every line drawn over
   * them. A fill's job here is to say "this region is solar" and let the eye
   * carry on; what gets measured is the boundary, and that now carries the
   * ink. The value comes from a token because the two themes need different
   * numbers — see the comment on --l-series-fill-opacity.
   */
  const fillWash = Number(colors.fillOpacity);

  const rows = useMemo<Row[]>(
    () =>
      data.map((point) => ({
        key: point.hourLabel,
        endLabel: point.endLabel,
        demand: point.demand,
        pv: point.pv,
        wind: point.wind,
        outages: point.outages,
        exchange: point.exchange,
        generation: point.generation,
        // > 0, not !== null: a 0 MW night hour is a real reading, not a gap,
        // and the seam Lines below must treat it as one — see the fix note on
        // the seam Lines themselves for why a plain `pv` gate drew a phantom
        // white notch under the wind band on every PV-less hour.
        pvSeam: point.pv !== null && point.pv > 0 ? point.pv : null,
        ...redispatchForPoint(point, redispatch),
        kseDemand:
          kseDemand?.get(point.time.getTime() - HOUR_MS) ?? null,
      })),
    [data, redispatch, kseDemand]
  );

  const curtailmentHours = useMemo(
    () => Array.from(redispatch?.values() ?? []),
    [redispatch]
  );
  const showCurtailment = hasCurtailment(curtailmentHours);

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [
      row.demand,
      row.generation,
      // The OZE stack's top. Usually below grid generation, but totals include
      // prosumer PV, so around noon the stack can top every grid figure.
      (row.pv ?? 0) + (row.wind ?? 0),
      // Exchange goes negative when Poland exports. A domain anchored at zero
      // clipped those hours away entirely, leaving the line flat against the
      // axis exactly when it carried the most information.
      row.exchange,
      // Same idea for curtailment: 0 on every hour without it, so the axis
      // only dips below zero for this reason on a day that actually has some.
      (row.pvRed ?? 0) + (row.windRed ?? 0),
    ]);
    const valid = values.filter(
      (v): v is number => v !== null && Number.isFinite(v)
    );
    return niceScaleRange(
      valid.length > 0 ? Math.min(...valid) : NaN,
      valid.length > 0 ? Math.max(...valid) : NaN
    );
  }, [rows]);

  const ticks = useMemo(() => hourTicks(rows.map((row) => row.key)), [rows]);

  if (rows.every((row) => row.demand === null)) {
    return (
      <div className={`${CHART_BOX} grid place-items-center text-[0.8125rem] text-text-tertiary`}>
        Brak danych o generacji
      </div>
    );
  }

  return (
    <>
      {/*
        Order follows the hierarchy the chart is read in, not the order the
        series are drawn. Demand is the reference; grid generation is the
        context measured against it, so the two sit side by side — a reader
        comparing the solid key with the dashed one directly below their own
        two lines gets the answer without parsing the whole row.

        Four "?" buttons became one. The frames-of-reference story was told
        three times, once per popover, each time a fragment; it is one story
        and it lives on the line whose frame is the surprising one. That drops
        two buttons and the two longest labels shed a word each, which is what
        pulls the legend back off its third line on a phone.
      */}
      <ChartLegend
        dense
        items={[
          {
            /* No "(sieć)" here, and one on the entry below. The marker's job
               is to stop a reader measuring a grid figure against a country
               total, and only one of these two lines is ever mistaken for the
               OZE stack it is drawn on top of. Demand is the axis everything
               is read against, not a source competing with them. The tooltip,
               where the numbers are actually compared side by side, keeps both
               markers — and dropping this one is what buys the legend its
               second row back on a phone. */
            label: 'Zapotrzebowanie',
            swatch: <LineSwatch color={colors.demand} />,
          },
          {
            label: 'Generacja (sieć)',
            swatch: <LineSwatch color={colors.other} dashed />,
            info: [
              'Suma jednostek wytwórczych i magazynów widzianych przez operatora w sieci — bilansuje się z zapotrzebowaniem sieciowym i wymianą.',
              'Słońce i wiatr są tu podane jako wartości całkowite dla kraju, łącznie z mikroinstalacjami prosumenckimi. Te mikroinstalacje nie wchodzą w linię generacji sieciowej: ich produkcja obniża zapotrzebowanie sieciowe, zamiast być liczona po stronie generacji.',
              'Dlatego słońce i wiatr potrafią być wyższe niż ta linia. Procent w dymku pokazuje udział OZE w krajowym miksie — zapotrzebowaniu kraju skorygowanym o wymianę transgraniczną, czyli w energii faktycznie zostającej w kraju do zużycia, a nie w tym, co elektrownie wyprodukowały. PSE publikuje obie wielkości (zapotrzebowanie i wymianę) tylko dla bieżącej doby, więc gdy którejś brakuje, linii procentu po prostu nie ma — bez zastępczego wyliczenia.',
            ],
          },
          {
            label: 'Fotowoltaika',
            swatch: <AreaSwatch fill={colors.pv} border={colors.pv} />,
          },
          {
            label: 'Wiatr',
            swatch: <AreaSwatch fill={colors.wind} border={colors.wind} />,
          },
          /* Curtailment directly after the two sources it curtails, and only
             then exchange. Its swatch IS those two sources' colours, so the
             pairing is what the entry is; "OZE" then no longer has to be said
             in words, which is the word the phone row could not afford. */
          ...(showCurtailment
            ? [
                {
                  label: 'Redysponowanie',
                  swatch: (
                    <span className="flex items-center gap-0.5">
                      <AreaSwatch fill={colors.pv} border={colors.pv} />
                      <AreaSwatch fill={colors.wind} border={colors.wind} />
                    </span>
                  ),
                  info: [
                    'PSE poleciło elektrowniom słonecznym i wiatrowym ograniczyć produkcję — bo w danym momencie w sieci było za dużo energii albo sieć nie miała jak jej odebrać.',
                    'Warstwa pod osią pokazuje, o ile średnio w danej godzinie ograniczono produkcję.',
                  ],
                },
              ]
            : []),
          {
            label: 'Wymiana',
            swatch: <LineSwatch color={colors.exchange} dotted />,
          },
        ]}
      />

      <figure className="m-0">
      <div className={CHART_BOX} ref={ref} {...handlers}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={CHART_MARGIN}>
            {/* Solid, not dashed. Three of the four things drawn on this plot
                now carry a stroke pattern that means something — solid demand,
                dashed generation, dotted exchange — and a dashed grid behind
                them competes with every one of them. A hairline one step off
                the surface is the recessive form. */}
            <CartesianGrid vertical={false} stroke={colors.grid} />

            <XAxis
              dataKey="key"
              ticks={ticks}
              interval={0}
              tickFormatter={shortHour}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: colors.axis }}
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
              tickMargin={8}
            />

            <YAxis
              domain={[scale.min, scale.max]}
              ticks={scale.ticks}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: colors.axis }}
              tickFormatter={formatMW}
              tickLine={false}
              axisLine={false}
              width={axisWidthFor(scale.ticks)}
            />

            {/* OZE stacked: the height of the stack is the country's total
                solar plus wind, micro-installations included. Deliberately NOT
                topped up to grid generation — that difference lives in another
                frame of reference (see Row.generation).

                A wash with a drawn edge, where this used to be a 0.55 block.
                Two saturated slabs filling half the plot outweighed every line
                on it, which is the "thick saturated blocks" failure outright:
                area fill belongs at roughly a tenth of the hue, and what the
                reader actually measures — the top of the solar band, the top
                of the stack — is the boundary, so the boundary gets the ink
                instead. Same move the reserve view already makes with its
                band edges. */}
            <Area
              type="monotone"
              dataKey="pv"
              stackId="mix"
              stroke={colors.pv}
              strokeWidth={1.5}
              fill={colors.pvFill}
              fillOpacity={fillWash}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="wind"
              stackId="mix"
              stroke={colors.wind}
              strokeWidth={1.5}
              fill={colors.windFill}
              fillOpacity={fillWash}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />

            {/* Non-market curtailment, drawn below zero in the colour of the
                series it curtails. A separate stackId from "mix" above: these
                two never share a baseline with generation, they sit under it.
                Verified in isolation that Recharts 3.7 stacks negative-valued
                Areas downward from zero (each series extending the stack
                further down, not overlapping) for both "monotone" and "step"
                curves, so there was no need to fall back to <Bar>. */}
            {/* The layer used to carry a strokeless 0.3 fill, which at monitor
                scale (a 25 GW axis) was nearly invisible and moved only 0.057%
                of pixels — BELOW the 0.1% visual-regression threshold, so it
                could silently disappear with every screenshot test green. It
                was then raised to a 0.5 fill with a hairline stroke.

                Now the ink moves from the fill to the edge, the same way the
                OZE stack above did: at 0.5 this band was nearly three times
                the weight of the day's main story sitting right above it, and
                a footnote drawn louder than the text is a hierarchy inverted.
                A 1.5px full-strength edge reads from a desk away and gives the
                regression far more than 0.1% to hold on to. */}
            <Area
              type="monotone"
              dataKey="pvRed"
              stackId="redispatch"
              stroke={colors.pv}
              strokeWidth={1.5}
              fill={colors.pv}
              fillOpacity={0.28}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="windRed"
              stackId="redispatch"
              stroke={colors.wind}
              strokeWidth={1.5}
              fill={colors.wind}
              fillOpacity={0.28}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />

            {/*
              The seam between solar and wind, given the same 2px surface gap
              every other pair of touching marks in this app already has.

              PV is the bottom of the "mix" stack, so its own top edge IS the
              boundary between the two bands — and stacked areas touch, so the
              orange edge sat directly against the cyan wash with nothing
              between them. At 06:00 and again at 18:00 the solar band is a few
              pixels tall and the two colours simply met, which is the one place
              the reader is measuring: how much of the stack is sun.

              Same mechanism as the casing under `demand` and `generation`
              below, and the same arithmetic: PV_EDGE + CASING, so the seam is
              1.5px of surface on each side — exactly what the two grid lines
              already carry. Written with the same constant rather than a
              literal, so the three can never drift apart.

              5.5px was the first attempt (a 2px gap per side, the round number
              marks-and-anatomy names). Measured against the live 05.09 curve
              instead: the plot ran 49 MW per pixel, and the solar band is 0px
              from 20:00 to 05:00, 3.6px at 06:00, 27.9px at 07:00, 169px at its
              11:00 peak, and back to 5.0px at 19:00. A 5.5px casing reaches
              2.75px below the edge and so leaves 0.85px of orange fill at 06:00
              and 2.25px at 19:00; at 4.5px those become 1.35px and 2.75px. The
              two hours either side of the band being readable at all are the
              only ones where the difference exists, and in both of them the
              narrower casing keeps more of a band that is already a hairline.
              0.5px of extra separation at midday, where the band is 169px tall,
              buys nothing against that.

              Drawn off `pvSeam`, not `pv` — and this is the fix, not the
              original design. `pv` is 0 (not null) through the whole night, so
              a casing keyed on it drew its 4.5px white notch under the wind
              band for every one of those hours too, cutting a stripe out of a
              band with no seam to separate in the first place — there is
              nothing under the wind area at 03:00 for the casing to protect a
              boundary against. `pvSeam` is null whenever PV is not strictly
              positive, and `connectNulls={false}` on both Lines below turns
              that into an honest gap: the casing and the edge draw only across
              the hours that actually have a solar band to hem in, and stop
              existing the moment PV returns to zero. Verified against the
              05:00 dawn: no white notch remains under the wind band at any
              PV-less hour, and the seam still starts exactly at the first hour
              PV goes positive.

              Deliberately NOT applied to the redispatch layer below zero. That
              band was consciously slimmed to a wash plus a hairline (see its
              comment): it is a footnote, and giving it the same seam treatment
              as the day's main stack would restate it as a peer.
            */}
            <Line
              type="monotone"
              dataKey="pvSeam"
              stroke={colors.surface}
              strokeWidth={PV_EDGE + CASING}
              dot={false}
              activeDot={false}
              legendType="none"
              connectNulls={false}
              animationDuration={animationMs}
            />
            <Line
              type="monotone"
              dataKey="pvSeam"
              stroke={colors.pv}
              strokeWidth={PV_EDGE}
              dot={false}
              activeDot={false}
              legendType="none"
              connectNulls={false}
              animationDuration={animationMs}
            />

            <Tooltip
              active={tooltipActive}
              content={<GenerationTooltip />}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {/* Crossing this line means the system flipped from exporting to
                importing — a signal in its own right. Stronger than it was,
                because the gridlines around it stopped being dashed: at 0.5 it
                had become indistinguishable from the ordinary tick rule
                sitting on the same y, and a reference that reads as chrome
                stops being a reference. */}
            <ReferenceLine y={0} stroke={colors.axis} strokeOpacity={0.85} />

            {/* Dotted, and thinner than either grid line. Exchange answers a
                question nobody comes to this view with; it earns its place by
                being available, not by being seen. Dotted also frees the dash
                pattern to mean exactly one thing — grid generation. */}
            <Line
              type="monotone"
              dataKey="exchange"
              stroke={colors.exchange}
              strokeWidth={1.75}
              strokeDasharray="1 4"
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            {/*
              Grid generation, and below it its casing.

              Two things had to change at once. It is a LINE rather than a
              "Pozostałe" band because that band was generation − PV − wind, a
              subtraction across two frames of reference that erased ~7 GW of
              conventional sources at noon (see Row.generation) — that stays.
              But as drawn it was a 2px solid grey against a 2.75px solid ink
              demand line: same character, similar weight, crossing each other
              five times a day. Nothing but the legend told them apart, and a
              legend is not something you consult mid-glance.

              So generation takes the dash and the thinner stroke, demand keeps
              solid and heavy, and the reader gets the answer from the stroke
              itself. The casing — a wider line in the surface colour, painted
              underneath with the same dash so it never becomes a solid ribbon
              — is the surface ring the mark specs ask for on overlapping
              marks: it carries the line intact across the OZE fills and across
              the demand line without either having to be lightened.
            */}
            <Line
              type="monotone"
              dataKey="generation"
              stroke={colors.surface}
              strokeWidth={GENERATION_WIDTH + CASING}
              strokeDasharray={GENERATION_DASH}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="generation"
              stroke={colors.other}
              strokeWidth={GENERATION_WIDTH}
              strokeDasharray={GENERATION_DASH}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            {currentHourLabel && (
              <ReferenceLine
                x={currentHourLabel}
                stroke={colors.accent}
                strokeWidth={1.5}
                label={{
                  value: 'teraz',
                  position: 'top',
                  fontSize: LABEL_FONT_SIZE,
                  fill: colors.accent,
                }}
              />
            )}

            {/* Demand last, so it is the one thing nothing is drawn over. It
                is the reference every other series on this view is read
                against, and the paint order is the only place that ranking is
                actually enforced. */}
            <Line
              type="monotone"
              dataKey="demand"
              stroke={colors.surface}
              strokeWidth={DEMAND_WIDTH + CASING}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="demand"
              stroke={colors.demand}
              strokeWidth={DEMAND_WIDTH}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              /* Cleared with the tooltip: `active={false}` hides the box but
                 the dot is series state, so it lingered and pointed at an hour
                 the user had already dismissed. */
              activeDot={
                tooltipActive === false
                  ? false
                  : {
                      r: 4,
                      fill: colors.demand,
                      stroke: colors.surface,
                      strokeWidth: 2,
                    }
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
        <figcaption className="sr-only">
          Krajowe zapotrzebowanie na tle generacji z wiatru i fotowoltaiki w
          kolejnych godzinach doby; te same wartości godzina po godzinie
          znajdują się w tabeli pod wykresem.
        </figcaption>
      </figure>

      <HourTable
        rows={rows}
        rowKey={(row) => row.key}
        storageKey="hours-generation"
        columns={GENERATION_COLUMNS}
      />
    </>
  );
};

export default GenerationChart;
