import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { AlertRange, PSEDataPoint } from '../types';
import { niceScale } from '../utils/scale';
import { classifyMargin } from '../utils/dataTransform';
import { alertSpans } from '../utils/alertSpans';
import { useChartColors } from '../hooks/useChartColors';
import { STATUS_LABEL, STATUS_TEXT } from '../utils/status';
import { CALL_PERIOD_EXEMPTION_MW } from '../utils/constants';
import {
  ANIMATION_MS,
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

interface ReserveChartProps {
  data: PSEDataPoint[];
  /**
   * Breaching hours already merged into ranges — the very same array the alerts
   * panel lists, handed down rather than recomputed so the two cannot disagree.
   */
  alertRanges: AlertRange[];
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
  /**
   * The two thresholds, as curves the reserve is read against. Drawn as lines
   * rather than filled zones: the alarm zone reached from the axis floor to
   * `required + redThreshold`, which is some 40% of the plot, so it painted the
   * chart red on every day including the calm ones. Emphasis now belongs to the
   * breaches, which are shaded — a threshold is a boundary you measure against,
   * not an event.
   */
  alarmTop: number | null;
  warnTop: number | null;
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: Row }>;
  orangeThreshold: number;
  redThreshold: number;
}

const ReserveTooltip: React.FC<TooltipProps> = ({
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
        <span className={`text-[11px] font-semibold ${STATUS_TEXT[status]}`}>
          {STATUS_LABEL[status]}
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

const ReserveChart: React.FC<ReserveChartProps> = ({
  data,
  alertRanges,
  orangeThreshold,
  redThreshold,
  currentHourLabel,
}) => {
  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

  const rows = useMemo<Row[]>(
    () =>
      data.map((point) => {
        const { reserve, required } = point;
        return {
          key: point.hourLabel,
          endLabel: point.endLabel,
          reserve,
          required,
          // Both follow the required curve, because the alert thresholds are
          // margins above it — a flat horizontal line would misrepresent them.
          alarmTop: required === null ? null : required + redThreshold,
          warnTop: required === null ? null : required + orangeThreshold,
        };
      }),
    [data, orangeThreshold, redThreshold]
  );

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [row.reserve, row.warnTop]);
    const valid = values.filter(
      (v): v is number => v !== null && Number.isFinite(v)
    );
    // niceScale keeps every axis label on a round number and copes with an
    // empty set, where Math.max() would hand back -Infinity.
    return niceScale(valid.length > 0 ? Math.max(...valid) : NaN);
  }, [rows]);

  const ticks = useMemo(() => hourTicks(rows.map((row) => row.key)), [rows]);

  const spans = useMemo(
    () => alertSpans(rows.map((row) => row.key), alertRanges),
    [alertRanges, rows]
  );

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
            // Border is the threshold line, fill is the shading over hours that
            // crossed it — so the swatch shows both halves of what is drawn.
            swatch: (
              <AreaSwatch
                fill={colors.breachWarn}
                border={colors.bandWarnEdge}
              />
            ),
          },
          {
            label: 'Alarm',
            swatch: (
              <AreaSwatch
                fill={colors.breachAlarm}
                border={colors.bandAlarmEdge}
              />
            ),
          },
          {
            label: `Próg ${CALL_PERIOD_EXEMPTION_MW} MW`,
            swatch: <LineSwatch color={colors.threshold} dashed />,
            info:
              `Powyżej ${CALL_PERIOD_EXEMPTION_MW} MW operator może odstąpić od ogłoszenia ` +
              'okresu przywołania mimo rezerwy poniżej wymaganej. ' +
              'Przywołania ogłasza się w dni robocze 7:00–22:00.',
          },
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
              tick={{ fontSize: 11, fill: colors.axis }}
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
              tickMargin={8}
            />

            <YAxis
              domain={[0, scale.max]}
              ticks={scale.ticks}
              tick={{ fontSize: 11, fill: colors.axis }}
              tickFormatter={formatMW}
              tickLine={false}
              axisLine={false}
              width={axisWidthFor(scale.ticks)}
            />

            {/* The thresholds themselves. A flat tint reads as a smudge; the
                boundary is the thing you actually measure the curve against. */}
            <Line
              type="monotone"
              dataKey="alarmTop"
              stroke={colors.bandAlarmEdge}
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="warnTop"
              stroke={colors.bandWarnEdge}
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={false}
            />

            {/* One span per breach, not one rule per hour: consecutive breaching
                hours used to draw a rule each, and an evening block of eight
                merged into hatching that read as damage to the chart rather than
                as information. */}
            {spans.map(({ key, from, to, severity }) => (
              <ReferenceArea
                key={`alert-${key}`}
                x1={from}
                x2={to}
                fill={severity === 'red' ? colors.breachAlarm : colors.breachWarn}
                fillOpacity={1}
                stroke={
                  severity === 'red'
                    ? colors.bandAlarmEdge
                    : colors.bandWarnEdge
                }
                strokeOpacity={0.5}
                strokeWidth={1}
              />
            ))}

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
              /* Left, not right: the reserve dips towards this line in the
                 evening, so a label at the right-hand end sat on the curve
                 exactly when the line mattered most. The early hours below it
                 are reliably empty — that is the shape of a demand day. */
              label={{
                value: `${CALL_PERIOD_EXEMPTION_MW} MW`,
                position: 'insideBottomLeft',
                fontSize: 10,
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
                  fontSize: 10,
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
              animationDuration={ANIMATION_MS}
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
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
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
    </>
  );
};

export default ReserveChart;
