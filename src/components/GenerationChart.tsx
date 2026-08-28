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
   * MW curtailed this hour by PSE order, <= 0. Null means the day's
   * redispatch data has not loaded (or does not exist yet) — nothing is
   * drawn. Zero means it loaded and there was nothing curtailed that hour.
   */
  pvRed: number | null;
  windRed: number | null;
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

  return (
    <ChartTooltipBox>
      <div className="mb-1 font-semibold text-text">
        {String(label)}&ndash;{row.endLabel}
      </div>
      <dl className="space-y-0.5">
        {/* Totals and grid figures kept apart, no percentage across them: PV
            and wind include micro-installations, grid generation does not, and
            a share computed across those two frames is how a 93% OZE figure
            reached the screen. */}
        <TooltipRow label="Fotowoltaika (całk.)" value={`${formatMW(pv)} MW`} />
        <TooltipRow label="Wiatr (całk.)" value={`${formatMW(wind)} MW`} />
        <TooltipRow
          label="Generacja sieciowa"
          value={generation === null ? 'brak' : `${formatMW(generation)} MW`}
          divider
        />
        <TooltipRow
          label="Zapotrzebowanie sieciowe"
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
const GenerationChart: React.FC<GenerationChartProps> = ({
  data,
  currentHourLabel,
  redispatch,
}) => {
  const animationMs = useChartAnimationMs();

  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

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
        ...redispatchForPoint(point, redispatch),
      })),
    [data, redispatch]
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
      <ChartLegend
        items={[
          {
            label: 'Zapotrzebowanie sieciowe',
            swatch: <LineSwatch color={colors.demand} />,
          },
          {
            label: 'Fotowoltaika',
            swatch: <AreaSwatch fill={colors.pv} border={colors.pv} />,
            info: [
              'Całkowita generacja słoneczna w kraju, łącznie z mikroinstalacjami prosumenckimi.',
            ],
          },
          {
            label: 'Wiatr',
            swatch: <AreaSwatch fill={colors.wind} border={colors.wind} />,
            info: [
              'Całkowita generacja wiatrowa w kraju, łącznie z małymi instalacjami.',
            ],
          },
          {
            label: 'Generacja sieciowa',
            swatch: <LineSwatch color={colors.other} />,
            info: [
              'Suma jednostek wytwórczych i magazynów widzianych przez operatora w sieci — bilansuje się z zapotrzebowaniem sieciowym i wymianą.',
              'Mikroinstalacje prosumenckie nie wchodzą w tę linię: ich produkcja obniża zapotrzebowanie sieciowe, zamiast być liczona po stronie generacji. Dlatego słońce i wiatr (wartości całkowite) potrafią być wyższe niż ta linia i dlatego wykres nie podaje procentowego udziału OZE — te dwie miary mają różne układy odniesienia.',
            ],
          },
          {
            label: 'Wymiana',
            swatch: <LineSwatch color={colors.exchange} dashed />,
          },
          ...(showCurtailment
            ? [
                {
                  label: 'Redysponowanie OZE',
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
        ]}
      />

      <div className={CHART_BOX} ref={ref} {...handlers}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid
              vertical={false}
              stroke={colors.grid}
              strokeDasharray="3 3"
            />

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
                frame of reference (see Row.generation). */}
            <Area
              type="monotone"
              dataKey="pv"
              stackId="mix"
              stroke="none"
              fill={colors.pv}
              fillOpacity={0.55}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="wind"
              stackId="mix"
              stroke="none"
              fill={colors.wind}
              fillOpacity={0.55}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            {/* Grid generation as its own line rather than a "Pozostałe" band:
                the band used to be generation − PV − wind, a subtraction across
                two frames of reference (grid units vs country totals) that
                erased ~7 GW of conventional sources at noon. See the comment on
                Row.generation. */}
            <Line
              type="monotone"
              dataKey="generation"
              stroke={colors.other}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            {/* Non-market curtailment, drawn below zero in the colour of the
                series it curtails. A separate stackId from "mix" above: these
                two never share a baseline with generation, they sit under it.
                Verified in isolation that Recharts 3.7 stacks negative-valued
                Areas downward from zero (each series extending the stack
                further down, not overlapping) for both "monotone" and "step"
                curves, so there was no need to fall back to <Bar>. */}
            {/* Opacity 0.5 with a stroke, up from a strokeless 0.3: at monitor
                scale (a 25 GW axis) the band was nearly invisible, and its
                baseline diff sat at 0.057% — BELOW the 0.1% visual-regression
                threshold, meaning the layer could silently disappear and every
                screenshot test would stay green. Strong enough to read from a
                desk away is also strong enough for the regression to guard. */}
            <Area
              type="monotone"
              dataKey="pvRed"
              stackId="redispatch"
              stroke={colors.pv}
              strokeWidth={1}
              fill={colors.pv}
              fillOpacity={0.5}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="windRed"
              stackId="redispatch"
              stroke={colors.wind}
              strokeWidth={1}
              fill={colors.wind}
              fillOpacity={0.5}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />

            <Tooltip
              active={tooltipActive}
              content={<GenerationTooltip />}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {/* Crossing this line means the system flipped from exporting to
                importing — a signal in its own right. */}
            <ReferenceLine y={0} stroke={colors.axis} strokeOpacity={0.5} />

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

            <Line
              type="monotone"
              dataKey="exchange"
              stroke={colors.exchange}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            <Line
              type="monotone"
              dataKey="demand"
              stroke={colors.demand}
              strokeWidth={2.75}
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
    </>
  );
};

export default GenerationChart;
