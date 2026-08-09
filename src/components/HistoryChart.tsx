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
import { niceScaleRange } from '../utils/scale';
import { marginDistribution, standingFor } from '../utils/history';
import { useChartColors } from '../hooks/useChartColors';
import { HistoryState } from '../hooks/useHistory';
import {
  ANIMATION_MS,
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

interface HistoryChartProps {
  /** Name of the day being compared — the chart also serves Jutro and Pojutrze. */
  dayLabel: string;
  dayData: PSEDataPoint[];
  history: PSEDataPoint[];
  state: HistoryState;
  days: number;
  onRetry: () => void;
}

interface Row {
  key: string;
  band: [number, number] | null;
  median: number | null;
  today: number | null;
  samples: number;
}

const STANDING_LABEL = {
  below: 'nietypowo nisko',
  typical: 'w normie',
  above: 'nietypowo wysoko',
  unknown: 'brak porównania',
} as const;

const STANDING_TONE = {
  below: 'text-alarm-text',
  typical: 'text-text-secondary',
  above: 'text-ok-text',
  unknown: 'text-text-tertiary',
} as const;

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: Row }>;
}

const HistoryTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  const standing = standingFor(
    row.today,
    row.band
      ? {
          hourLabel: row.key,
          p10: row.band[0],
          p50: row.median ?? 0,
          p90: row.band[1],
          samples: row.samples,
        }
      : undefined
  );

  return (
    <ChartTooltipBox>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-text">{String(label)}</span>
        <span className={`text-[0.6875rem] font-semibold ${STANDING_TONE[standing]}`}>
          {STANDING_LABEL[standing]}
        </span>
      </div>
      <dl className="space-y-0.5">
        <TooltipRow
          label="Margines"
          value={row.today === null ? 'brak' : `${formatMW(row.today)} MW`}
        />
        <TooltipRow
          label="Zwykle o tej porze"
          value={row.median === null ? 'brak' : `${formatMW(row.median)} MW`}
          divider
        />
        <TooltipRow
          label="Typowo od"
          value={row.band ? `${formatMW(row.band[0])} MW` : 'brak'}
        />
        <TooltipRow
          label="Typowo do"
          value={row.band ? `${formatMW(row.band[1])} MW` : 'brak'}
        />
      </dl>
    </ChartTooltipBox>
  );
};

/**
 * Today's margin against the spread of the same hour on past days. Answers the
 * question a single day's curve cannot: is this evening unusual, or is it simply
 * what evenings look like?
 */
const HistoryChart: React.FC<HistoryChartProps> = ({
  dayLabel,
  dayData,
  history,
  state,
  days,
  onRetry,
}) => {
  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

  const distribution = useMemo(() => marginDistribution(history), [history]);

  const rows = useMemo<Row[]>(() => {
    const todayByHour = new Map<string, number>();
    for (const point of dayData) {
      if (point.reserve === null || point.required === null) continue;
      todayByHour.set(point.hourLabel, point.reserve - point.required);
    }

    // Driven by the historical hours, so a day with no data still shows the band
    return distribution.map((hour) => ({
      key: hour.hourLabel,
      band: [hour.p10, hour.p90] as [number, number],
      median: hour.p50,
      today: todayByHour.get(hour.hourLabel) ?? null,
      samples: hour.samples,
    }));
  }, [distribution, dayData]);

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [
      row.band?.[0] ?? null,
      row.band?.[1] ?? null,
      row.today,
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

  /**
   * Plain-language answer to "is today unusual, and when?".
   * Counts both directions: an hour above the band is also atypical, and
   * reporting only the downside would call such a day entirely ordinary.
   */
  const summary = useMemo(() => {
    const compared = rows.filter((row) => row.today !== null && row.band);
    if (compared.length === 0) return null;

    const below = compared.filter((row) => row.today! < row.band![0]);
    const above = compared.filter((row) => row.today! > row.band![1]);

    if (below.length > 0) {
      const worst = below.reduce((a, b) =>
        a.today! - a.band![0] <= b.today! - b.band![0] ? a : b
      );
      // Phrased to sidestep Polish numeral agreement, which differs for
      // 1 / 2-4 / 5+ and would need a table to get right for one sentence.
      const rest =
        above.length > 0 ? `, a przez ${above.length} godz. powyżej` : '';
      return `${dayLabel}: przez ${below.length} godz. margines poniżej typowego zakresu${rest}. Najciaśniej o ${worst.key}.`;
    }

    if (above.length > 0) {
      return `${dayLabel}: margines nigdzie nie schodzi poniżej normy, a przez ${above.length} godz. zapas jest większy niż zwykle.`;
    }

    return `${dayLabel}: każda godzina mieści się w typowym zakresie.`;
  }, [rows, dayLabel]);

  if (state === 'loading' || state === 'idle') {
    return (
      <div className={CHART_BOX}>
        <div className="h-full animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (state === 'error' || rows.length === 0) {
    return (
      <div className={`${CHART_BOX} grid place-items-center`}>
        <div className="text-center">
          <p className="text-[0.8125rem] text-text-tertiary">
            Nie udało się pobrać historii
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-9 rounded-lg px-3 text-[0.8125rem] font-medium text-accent-text"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {summary && (
        <p className="mb-2 px-1 text-[0.8125rem] font-medium text-text">{summary}</p>
      )}

      <ChartLegend
        items={[
          { label: dayLabel, swatch: <LineSwatch color={colors.reserve} /> },
          { label: 'Mediana', swatch: <LineSwatch color={colors.history} dashed /> },
          {
            label: 'Typowy zakres',
            swatch: (
              <AreaSwatch fill={colors.bandHistory} border={colors.history} />
            ),
            // The band is the one entry that means nothing without explaining;
            // 'Dziś' and 'Mediana' speak for themselves.
            info:
              'Wykres pokazuje margines, czyli dostępną rezerwę minus wymaganą — ' +
              'poniżej zera rezerwa nie pokrywa wymagań. Pasmo to zakres typowy ' +
              `dla danej godziny: mieściło się w nim 80% z ostatnich ${days} dni.`,
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

            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill={colors.bandHistory}
              fillOpacity={1}
              animationDuration={ANIMATION_MS}
              activeDot={false}
              connectNulls={false}
            />

            <Tooltip
              active={tooltipActive}
              content={<HistoryTooltip />}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {/* Below this line the reserve fails to cover what is required */}
            <ReferenceLine
              y={0}
              stroke={colors.alarm}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />

            <Line
              type="monotone"
              dataKey="median"
              stroke={colors.history}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={false}
            />

            <Line
              type="monotone"
              dataKey="today"
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

export default HistoryChart;
