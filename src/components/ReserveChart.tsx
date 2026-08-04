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
import { niceScale } from '../utils/scale';
import { classifyMargin } from '../utils/dataTransform';
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

  /** Hours breaching a threshold, marked with a vertical rule on the chart. */
  const alertHours = useMemo(
    () =>
      rows
        .map((row) => {
          if (row.reserve === null || row.required === null) return null;
          const status = classifyMargin(
            row.reserve - row.required,
            orangeThreshold,
            redThreshold
          );
          return status === 'alarm' || status === 'warn'
            ? { key: row.key, status }
            : null;
        })
        .filter(
          (entry): entry is { key: string; status: 'alarm' | 'warn' } =>
            entry !== null
        ),
    [rows, orangeThreshold, redThreshold]
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
          },
        ]}
      />

      {/* The bands come from the user's own thresholds; this line does not, so
          it needs saying where it comes from. */}
      <p className="mb-2 px-1 text-[11px] leading-relaxed text-text-secondary">
        Mimo spadku rezerwy poniżej wymaganej operator może odstąpić od
        ogłoszenia okresu przywołania, jeżeli nadwyżka mocy nie jest niższa niż{' '}
        {CALL_PERIOD_EXEMPTION_MW} MW i uzna, że nie ma zagrożenia dla pokrycia
        zapotrzebowania. Sam okres przywołania ogłasza się w dni robocze między
        7:00 a 22:00, z co najmniej 8-godzinnym wyprzedzeniem.
      </p>

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

            {/* Threshold bands, drawn behind the series */}
            <Area
              type="monotone"
              dataKey="zoneAlarm"
              stroke="none"
              fill={colors.bandAlarm}
              fillOpacity={1}
              animationDuration={ANIMATION_MS}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="zoneWarn"
              stroke="none"
              fill={colors.bandWarn}
              fillOpacity={1}
              animationDuration={ANIMATION_MS}
              activeDot={false}
              connectNulls={false}
            />

            {/* Band edges. A flat tint alone reads as a smudge; the boundary is
                the thing you actually measure the curve against. */}
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

            {/* Vertical rule on every hour that breaches a threshold */}
            {alertHours.map(({ key, status }) => (
              <ReferenceLine
                key={`alert-${key}`}
                x={key}
                stroke={status === 'alarm' ? colors.alarm : colors.warn}
                strokeWidth={status === 'alarm' ? 1.5 : 1}
                strokeDasharray="4 4"
                strokeOpacity={0.55}
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
              label={{
                value: `${CALL_PERIOD_EXEMPTION_MW} MW`,
                position: 'insideBottomRight',
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
