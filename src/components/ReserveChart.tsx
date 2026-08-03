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
import { PSEDataPoint, SystemStatus } from '../types';
import { formatHourLabel, formatHourShort } from '../utils/dateHelpers';
import { niceScale } from '../utils/scale';
import { classifyMargin } from '../utils/dataTransform';
import { useChartColors } from '../hooks/useChartColors';
import { STATUS_LABEL, STATUS_TEXT } from '../utils/status';

interface ReserveChartProps {
  data: PSEDataPoint[];
  orangeThreshold: number;
  redThreshold: number;
  currentTimeStr: string | null;
  isLoading: boolean;
}

interface ChartRow {
  key: string;
  reserve: number | null;
  required: number | null;
  /** [bottom, top] band the margin must stay above — drawn as a range area. */
  zoneAlarm: [number, number] | null;
  zoneWarn: [number, number] | null;
  /** Upper edge of each band, stroked so the boundary is a crisp line. */
  alarmTop: number | null;
  warnTop: number | null;
}

const formatMW = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

/** Curves redraw rather than jump when the selected day changes. */
const ANIMATION_MS = 450;

/**
 * Recharts injects `active`/`payload`/`label` into whatever element is passed as
 * `content`, but its exported prop types don't describe that for custom content,
 * so the shape is declared here.
 */
interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: ChartRow }>;
  orangeThreshold: number;
  redThreshold: number;
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({
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
      <div className="rounded-xl bg-surface px-3 py-2 text-[12px] shadow-lg ring-1 ring-separator">
        <div className="font-semibold text-text">
          {formatHourLabel(String(label))}
        </div>
        <div className="text-text-tertiary">Brak danych</div>
      </div>
    );
  }

  const margin = row.reserve - row.required;
  const status = classifyMargin(margin, orangeThreshold, redThreshold);

  return (
    <div className="min-w-[10rem] rounded-xl bg-surface px-3 py-2 text-[12px] shadow-lg ring-1 ring-separator">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-text">
          {formatHourLabel(String(label))}
        </span>
        <span className={`text-[11px] font-semibold ${STATUS_TEXT[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <dl className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Rezerwa</dt>
          <dd className="tnum font-medium text-text">
            {formatMW(row.reserve)} MW
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Wymagana</dt>
          <dd className="tnum font-medium text-text">
            {formatMW(row.required)} MW
          </dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-separator pt-1">
          <dt className="text-text-secondary">Margines</dt>
          <dd className={`tnum font-semibold ${STATUS_TEXT[status]}`}>
            {margin > 0 ? '+' : ''}
            {formatMW(margin)} MW
          </dd>
        </div>
      </dl>
    </div>
  );
};

const ReserveChart: React.FC<ReserveChartProps> = ({
  data,
  orangeThreshold,
  redThreshold,
  currentTimeStr,
  isLoading,
}) => {
  const colors = useChartColors();

  const rows = useMemo<ChartRow[]>(
    () =>
      data.map((point) => {
        const { reserve, required } = point;
        return {
          key: point.timeStr,
          reserve,
          required,
          // Bands follow the required curve, because the alert thresholds are
          // margins above it — a flat horizontal band would misrepresent them.
          zoneAlarm:
            required === null ? null : [0, required + redThreshold],
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
    const values = rows.flatMap((row) => [
      row.reserve,
      row.zoneWarn?.[1] ?? null,
    ]);
    const valid = values.filter(
      (v): v is number => v !== null && Number.isFinite(v)
    );
    // niceScale keeps every axis label on a round number and copes with an
    // empty set, where Math.max() would hand back -Infinity.
    return niceScale(valid.length > 0 ? Math.max(...valid) : NaN);
  }, [rows]);

  /**
   * Width has to follow the widest tick label. A fixed value sized for four
   * digits clips the fifth once the reserve passes 10 000 MW.
   */
  const yAxisWidth = useMemo(() => {
    const longest = Math.max(
      ...scale.ticks.map((tick) => formatMW(tick).length)
    );
    // ~6.1px per digit at 11px, plus tick margin and a little breathing room
    return Math.ceil(longest * 6.5) + 18;
  }, [scale]);

  const xTicks = useMemo(() => {
    const ticks = rows.filter((_, i) => i % 4 === 0).map((row) => row.key);
    const last = rows[rows.length - 1];
    if (last && !ticks.includes(last.key)) ticks.push(last.key);
    return ticks;
  }, [rows]);

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
        .filter((entry): entry is { key: string; status: 'alarm' | 'warn' } =>
          entry !== null
        ),
    [rows, orangeThreshold, redThreshold]
  );

  if (isLoading && data.length === 0) {
    return (
      <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="h-[16rem] animate-pulse rounded-xl bg-surface-2" />
      </section>
    );
  }

  if (data.length === 0) {
    return (
      <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="grid h-[16rem] place-items-center text-[13px] text-text-tertiary">
          Brak danych do wyświetlenia
        </div>
      </section>
    );
  }

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <h2 className="text-[15px] font-semibold text-text">
          Rezerwa mocy <span className="text-text-tertiary">(MW)</span>
        </h2>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <li className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ background: colors.reserve }}
            />
            Dostępna
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: colors.required }}
            />
            Wymagana
          </li>
          {/* Swatches take the same values the bands are painted with, so the
              legend cannot drift away from the chart. */}
          <li className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[3px] border"
              style={{
                background: colors.bandWarn,
                borderColor: colors.bandWarnEdge,
              }}
            />
            Uwaga
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[3px] border"
              style={{
                background: colors.bandAlarm,
                borderColor: colors.bandAlarmEdge,
              }}
            />
            Alarm
          </li>
        </ul>
      </div>

      <div className="h-[45vh] max-h-[22rem] min-h-[15rem] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            /* top leaves room for the "teraz" label, which sits above the plot.
               left stays at 0: a negative inset pulls the Y axis past the SVG
               edge and clips the first digit of every label. */
            margin={{ top: 18, right: 10, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke={colors.grid}
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey="key"
              ticks={xTicks}
              interval={0}
              tickFormatter={formatHourShort}
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
              width={yAxisWidth}
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
              legendType="none"
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
              legendType="none"
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
              legendType="none"
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
              legendType="none"
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
              content={
                <ChartTooltip
                  orangeThreshold={orangeThreshold}
                  redThreshold={redThreshold}
                />
              }
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {currentTimeStr && (
              <ReferenceLine
                x={currentTimeStr}
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
              activeDot={{ r: 4, fill: colors.reserve, stroke: colors.surface, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default ReserveChart;
