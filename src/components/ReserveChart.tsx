import React, { useId, useMemo } from 'react';
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
import { niceScale } from '../utils/scale';
import { classifyMargin } from '../utils/dataTransform';
import { useChartColors } from '../hooks/useChartColors';
import { STATUS_TEXT, marginLabel } from '../utils/status';
import { CALL_PERIOD_EXEMPTION_MW } from '../utils/constants';
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

interface ReserveChartProps {
  data: PSEDataPoint[];
  orangeThreshold: number;
  redThreshold: number;
  currentHourLabel: string | null;
}

interface Row {
  /** Hour the block starts, e.g. "19:00" — also the X category. */
  key: string;
  endLabel: string;
  reserve: number | null;
  required: number | null;
  /** [bottom, top] band the margin must stay above — drawn as a range area. */
  zoneAlarm: [number, number] | null;
  zoneWarn: [number, number] | null;
  /** Upper edge of each band, stroked so the boundary is a crisp line. */
  alarmTop: number | null;
  warnTop: number | null;
  /** Set on hours that breach a threshold — marked with a dot on the curve. */
  alert: 'alarm' | 'warn' | null;
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: Row }>;
  orangeThreshold: number;
  redThreshold: number;
}

/** Exported for the cross-check test against HourTable, and for the same
 * reason GenerationTooltip is: on hover-only UI a chart-level assertion can
 * never see what the tooltip prints. */
export const ReserveTooltip: React.FC<TooltipProps> = ({
  active,
  payload,
  label,
  orangeThreshold,
  redThreshold,
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  if (row.reserve === null || row.required === null) {
    return (
      <ChartTooltipBox>
        <div className="font-semibold text-text">{String(label)}</div>
        <div className="text-text-tertiary">Brak danych</div>
      </ChartTooltipBox>
    );
  }

  const margin = row.reserve - row.required;
  const status = classifyMargin(margin, orangeThreshold, redThreshold);

  return (
    <ChartTooltipBox>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-text">
          {String(label)}&ndash;{row.endLabel}
        </span>
        <span className={`text-[0.6875rem] font-semibold ${STATUS_TEXT[status]}`}>
          {marginLabel(status, margin)}
        </span>
      </div>
      <dl className="space-y-0.5">
        <TooltipRow label="Rezerwa" value={`${formatMW(row.reserve)} MW`} />
        <TooltipRow label="Wymagana" value={`${formatMW(row.required)} MW`} />
        <TooltipRow
          label="Margines"
          value={`${margin > 0 ? '+' : ''}${formatMW(margin)} MW`}
          tone={STATUS_TEXT[status]}
          divider
        />
      </dl>
    </ChartTooltipBox>
  );
};

interface AlertDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: Row;
}

/**
 * The mark for an hour that breaches a threshold.
 *
 * It replaces a full-height dashed rule per alert hour. Those rules carried the
 * right information in the wrong form: a day with six thin hours drew six lines
 * from the top of the plot to the axis, and the plot stopped being a picture of
 * a curve over terrain — it became a picket fence. Each rule was also drawn at
 * strokeOpacity 0.55, i.e. simultaneously too faint to state anything and too
 * numerous to stay out of the way.
 *
 * A dot on the curve says the same thing in the place the reader is already
 * looking, and says one thing more: how deep the hour went. Severity is
 * double-encoded — colour, and the band the dot lands in — so it survives
 * colour-vision deficiency. The 2px surface ring keeps it legible where it
 * crosses the blue line and the band tints (marks-and-anatomy: markers >= 8px,
 * ring in the surface colour, never a border for separation).
 *
 * It also dissolves the paint-order bug the vertical rules had, where an alert
 * hour that was also the current hour lost its mark under the blue "teraz" line
 * and the chart went quiet at the one hour that mattered. Recharts 3 puts a
 * line's dots in a layer of their own, drawn after every series and every
 * reference line: measured on this chart, the dots sit at document index 86 and
 * the two rules at 47 and 53, and moving the "teraz" rule to the end of the
 * chart's children leaves the dots exactly where they were. So the old
 * compensation — full strength on that one hour, 0.55 on the rest, which is
 * half of why the marks were too faint to read — is simply gone.
 */
const alertDot =
  (colors: ReturnType<typeof useChartColors>) =>
  ({ cx, cy, index, payload }: AlertDotProps) => {
    const key = `alert-dot-${index}`;
    if (!payload?.alert || cx === undefined || cy === undefined) {
      return <g key={key} />;
    }
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        /* r=4, not 3.5: with the 2px surface ring the mark specs already ask
           for, the painted disc was 7px across — under the 8px floor a marker
           has to clear to stay findable on a phone held at arm's length. Half a
           pixel of radius is the whole change; the ring, the colour and the
           double encoding by band are untouched. */
        r={4}
        fill={
          payload.alert === 'alarm' ? colors.bandAlarmEdge : colors.bandWarnEdge
        }
        stroke={colors.surface}
        strokeWidth={2}
        data-alert={payload.alert}
      />
    );
  };

/**
 * The figures behind the reserve view.
 *
 * Margin last, because it is the derived column: reserve and required are what
 * PSE published, the margin is our subtraction, and a reader checking our
 * arithmetic reads left to right. It carries the only tone in the table — the
 * same alarm/warn ink the dots on the curve use — so the table and the plot
 * agree about which hours are the difficult ones.
 */
const RESERVE_COLUMNS: HourColumn<Row>[] = [
  { header: 'Godz.', value: (row) => `${row.key}–${row.endLabel}` },
  { header: 'Rezerwa', value: (row) => (row.reserve === null ? '—' : formatMW(row.reserve)) },
  { header: 'Wymagana', value: (row) => (row.required === null ? '—' : formatMW(row.required)) },
  {
    header: 'Margines',
    value: (row) => {
      if (row.reserve === null || row.required === null) return '—';
      const margin = row.reserve - row.required;
      return `${margin > 0 ? '+' : ''}${formatMW(margin)}`;
    },
    tone: (row) =>
      row.alert === 'alarm'
        ? 'text-alarm-text'
        : row.alert === 'warn'
        ? 'text-warn-text'
        : 'text-text',
  },
];

const ReserveChart: React.FC<ReserveChartProps> = ({
  data,
  orangeThreshold,
  redThreshold,
  currentHourLabel,
}) => {
  const animationMs = useChartAnimationMs();

  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

  const rows = useMemo<Row[]>(
    () =>
      data.map((point) => {
        const { reserve, required } = point;
        const status =
          reserve === null || required === null
            ? null
            : classifyMargin(reserve - required, orangeThreshold, redThreshold);
        return {
          key: point.hourLabel,
          endLabel: point.endLabel,
          reserve,
          required,
          alert: status === 'alarm' || status === 'warn' ? status : null,
          // Bands follow the required curve, because the alert thresholds are
          // margins above it — a flat horizontal band would misrepresent them.
          zoneAlarm: required === null ? null : [0, required + redThreshold],
          zoneWarn:
            required === null
              ? null
              : [required + redThreshold, required + orangeThreshold],
          alarmTop: required === null ? null : required + redThreshold,
          warnTop: required === null ? null : required + orangeThreshold,
        };
      }),
    [data, orangeThreshold, redThreshold]
  );

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [row.reserve, row.zoneWarn?.[1] ?? null]);
    const valid = values.filter(
      (v): v is number => v !== null && Number.isFinite(v)
    );
    // niceScale keeps every axis label on a round number and copes with an
    // empty set, where Math.max() would hand back -Infinity.
    return niceScale(valid.length > 0 ? Math.max(...valid) : NaN);
  }, [rows]);

  const ticks = useMemo(() => hourTicks(rows.map((row) => row.key)), [rows]);

  /*
   * An SVG gradient is addressed by a document-wide id, and a hard-coded one is
   * a collision waiting for the day a second chart mounts beside this one —
   * `url(#…)` resolves to whichever definition the document happens to hold, and
   * the wrong band would be painted with no error anywhere. Today the tab strip
   * shows one chart at a time; useId costs nothing and makes that a layout
   * choice rather than a load-bearing one. The colons React puts in the id are
   * legal in an XML name but not in every url(#…) parser, so they come out.
   */
  const gradientId = `reserve-alarm-${useId().replace(/:/g, '')}`;

  return (
    <>
      <ChartLegend
        items={[
          { label: 'Dostępna', swatch: <LineSwatch color={colors.reserve} /> },
          {
            label: 'Wymagana',
            swatch: <LineSwatch color={colors.required} dashed />,
          },
          {
            label: 'Uwaga',
            swatch: (
              <AreaSwatch fill={colors.bandWarn} border={colors.bandWarnEdge} />
            ),
          },
          {
            label: 'Alarm',
            swatch: (
              <AreaSwatch fill={colors.bandAlarm} border={colors.bandAlarmEdge} />
            ),
          },
          {
            label: `Próg ${CALL_PERIOD_EXEMPTION_MW} MW`,
            swatch: <LineSwatch color={colors.threshold} dashed />,
            /*
             * "Pominąć", not "odstąpić od" — the word this codebase rejected
             * once already and which survived here while the analysis layer moved
             * on. "Odstąpić" presupposes a declaration already hanging over the
             * reader, from which the operator then withdraws; the regulation says
             * plainly that the operator may simply not declare one.
             *
             * And nothing here promises a declaration below the threshold. The
             * rule grants leave to skip while the surplus holds; below it there
             * is no leave, which is not the same as an obligation — there have
             * been days under 1100 MW with no call period announced.
             */
            info:
              `Dopóki nadwyżka w systemie trzyma się powyżej ${CALL_PERIOD_EXEMPTION_MW} MW, ` +
              'operator może pominąć ogłoszenie okresu przywołania, nawet jeśli ' +
              'rezerwa nie pokrywa wymaganego poziomu. Poniżej tej granicy takiej ' +
              'możliwości już nie ma — co nie znaczy, że przywołanie zostanie ' +
              'ogłoszone. Przywołania ogłasza się w dni robocze 7:00–22:00.',
          },
        ]}
      />

      {/* <figure> rather than a bare div: the plot and the sentence that names
          it are one object, and the caption points at the table below for
          anyone who needs the figures rather than the shape. sr-only because
          the heading above the card already says the same thing on screen —
          this exists for a reader arriving by landmark. */}
      <figure className="m-0">
      <div className={CHART_BOX} ref={ref} {...handlers}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={CHART_MARGIN}>
            {/* Solid, not dashed - the same move the generation view already
                made. This plot draws two SIGNIFICANT dashed lines of its own,
                the required-reserve curve and the regulatory threshold at
                CALL_PERIOD_EXEMPTION_MW; a dashed grid behind them read as a
                third dash pattern competing for the same attention, when its
                only job is to sit quietly a step off the surface. Same
                colour token as before (colors.grid, --separator) so the grid
                stays exactly as quiet as it was - only the texture reading as
                "significant" is gone. */}
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
              domain={[0, scale.max]}
              ticks={scale.ticks}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: colors.axis }}
              tickFormatter={formatMW}
              tickLine={false}
              axisLine={false}
              width={axisWidthFor(scale.ticks)}
            />

            {/*
              The alarm zone is the only region on this plot with no bottom: it
              runs from its boundary all the way to zero, so a flat tint paints
              half the canvas one colour. That was the real difference from the
              generation view, which the owner kept comparing this one against —
              not the hues. Generation draws bounded organic shapes on white;
              reserve drew a wall. Three rounds of re-tinting the wall could not
              fix a wall, and a saturated fill over a block that large is the
              "thick saturated blocks" anti-pattern by area rather than by alpha.

              So the alarm zone gets depth instead of a uniform coat: full
              strength at the boundary, decaying to a whisper at the axis. The
              ink lands where the reading happens — the reserve curve lives near
              that boundary, and crossing it is the event — and the bottom of the
              plot goes back to being surface, which is where the 1100 MW rule
              and its label have to stay readable.

              It never reaches zero alpha. The faint tail still says "this is the
              alarm side"; it just stops shouting it 2000 MW below the line.
            */}
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.bandAlarm} />
                <stop
                  offset="9%"
                  stopColor={colors.bandAlarm}
                  stopOpacity={0.86}
                />
                <stop
                  offset="30%"
                  stopColor={colors.bandAlarm}
                  stopOpacity={0.44}
                />
                <stop
                  offset="62%"
                  stopColor={colors.bandAlarm}
                  stopOpacity={0.16}
                />
                <stop offset="100%" stopColor={colors.bandAlarmFade} />
              </linearGradient>
            </defs>

            {/* Threshold bands, drawn behind the series */}
            <Area
              type="monotone"
              dataKey="zoneAlarm"
              stroke="none"
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            {/* The warn band is bounded on both sides — it already has a shape,
                so it keeps a flat wash. The gradient above exists to solve the
                unbounded floor, not as decoration to be repeated. */}
            <Area
              type="monotone"
              dataKey="zoneWarn"
              stroke="none"
              fill={colors.bandWarn}
              fillOpacity={1}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />

            {/* Band edges. A flat tint alone reads as a smudge; the boundary is
                the thing you actually measure the curve against — and with the
                fill now fading away from it, the edge is what holds the shape.
                1.5px is the generation view's area-edge weight; these two bands
                are the same kind of mark and join the same family. A hairline
                was a hair, not a boundary. */}
            <Line
              type="monotone"
              dataKey="alarmTop"
              stroke={colors.bandAlarmEdge}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="warnTop"
              stroke={colors.bandWarnEdge}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            <Tooltip
              active={tooltipActive}
              content={
                <ReserveTooltip
                  orangeThreshold={orangeThreshold}
                  redThreshold={redThreshold}
                />
              }
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {/* Regulatory constant, deliberately styled apart from the alert
                bands: those move with the user's settings, this one does not. */}
            <ReferenceLine
              y={CALL_PERIOD_EXEMPTION_MW}
              stroke={colors.threshold}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={{
                value: `${CALL_PERIOD_EXEMPTION_MW} MW`,
                position: 'insideBottomRight',
                fontSize: LABEL_FONT_SIZE,
                fill: colors.threshold,
              }}
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

            <Line
              type="monotone"
              dataKey="required"
              stroke={colors.required}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            {/* No fill under this curve: it would span the full height and lay a
                third translucent layer over both bands, muddying every colour
                below the line. The line alone reads cleanly against the tints. */}
            <Line
              type="monotone"
              dataKey="reserve"
              stroke={colors.reserve}
              strokeWidth={2.75}
              /* Alert hours ride the curve itself — see alertDot. */
              dot={alertDot(colors)}
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
                      fill: colors.reserve,
                      stroke: colors.surface,
                      strokeWidth: 2,
                    }
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
        <figcaption className="sr-only">
          Dostępna i wymagana rezerwa mocy w kolejnych godzinach doby, z pasmami
          progów uwagi i alarmu; te same wartości godzina po godzinie znajdują
          się w tabeli pod wykresem.
        </figcaption>
      </figure>

      <HourTable
        rows={rows}
        rowKey={(row) => row.key}
        storageKey="hours-reserve"
        columns={RESERVE_COLUMNS}
      />
    </>
  );
};

export default ReserveChart;
