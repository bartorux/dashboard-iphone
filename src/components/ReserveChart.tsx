import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { PSEDataPoint, AlertSet } from '../types';
import { formatDateTime } from '../utils/dateHelpers';

interface ReserveChartProps {
  data: PSEDataPoint[];
  alerts: AlertSet;
  currentDayOffset: number;
}

interface ChartDataItem {
  hour: string;
  reserve: number | null;
  required: number | null;
  isCurrent: boolean;
}

const ReserveChart: React.FC<ReserveChartProps> = ({
  data,
  alerts,
  currentDayOffset,
}) => {
  const chartData = useMemo((): ChartDataItem[] => {
    const now = new Date();
    const currentHourStr =
      currentDayOffset === 0
        ? formatDateTime(
            new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              now.getHours()
            )
          )
        : '';

    return data.map((d) => ({
      hour: d.timeStr,
      reserve: d.reserve,
      required: d.required,
      isCurrent: d.timeStr === currentHourStr,
    }));
  }, [data, currentDayOffset]);

  // FIX: filter NaN before Math.max to avoid NaN propagation
  const maxValue = useMemo(() => {
    const validReserves = data
      .map((d) => d.reserve)
      .filter((r): r is number => r !== null && !isNaN(r));
    const validRequired = data
      .map((d) => d.required)
      .filter((r): r is number => r !== null && !isNaN(r));
    const allVals = [...validReserves, ...validRequired];
    return allVals.length > 0 ? Math.max(...allVals) * 1.1 : 1500;
  }, [data]);

  const currentPoint = useMemo(
    () => chartData.find((d) => d.isCurrent),
    [chartData]
  );

  // Alert reference lines
  const alertHours = useMemo(() => {
    const hours = new Set<string>();
    alerts.red.forEach((a) => hours.add(a.time));
    alerts.orange.forEach((a) => hours.add(a.time));
    return hours;
  }, [alerts]);

  const formatXTick = (value: string) => {
    try {
      const parts = value.split(' ');
      if (parts.length >= 2) {
        return parts[1].substring(0, 5);
      }
      return value;
    } catch {
      return value;
    }
  };

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md mx-0 my-2 p-1">
        <div className="flex items-center justify-center h-[200px] text-[#8e8e93]">
          Brak danych do wyświetlenia
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md mx-0 my-2 p-1">
      <div className="w-full h-[45vh] min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 15, bottom: 30, left: 5 }}
          >
            <defs>
              <linearGradient id="reserveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c0392b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#c0392b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="hour"
              tickFormatter={formatXTick}
              tick={{ fontSize: 10 }}
              interval={0}
              ticks={(() => {
                const t = chartData
                  .filter((_, i) => i % 4 === 0)
                  .map((d) => d.hour);
                const last = chartData[chartData.length - 1];
                if (last && !t.includes(last.hour)) {
                  t.push(last.hour);
                }
                return t;
              })()}
              height={35}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              width={40}
              domain={[0, maxValue]}
              label={{
                value: 'MW',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 10 },
              }}
            />
            <Tooltip
              formatter={(value, name) => {
                if (value == null) return ['brak danych', String(name)];
                const label =
                  name === 'reserve' ? 'Rezerwa mocy' : 'Wymagana rezerwa';
                return [`${Number(value).toFixed(0)} MW`, label];
              }}
              labelFormatter={(label) => formatXTick(String(label))}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={20}
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value: string) =>
                value === 'reserve' ? 'Rezerwa mocy' : 'Wymagana rezerwa'
              }
            />

            {/* Alert reference lines */}
            {Array.from(alertHours).map((hour) => {
              const isRed = alerts.red.some((a) => a.time === hour);
              return (
                <ReferenceLine
                  key={hour}
                  x={hour}
                  stroke={isRed ? '#ff3b30' : '#ff9500'}
                  strokeWidth={isRed ? 2 : 1}
                  strokeDasharray="5 5"
                />
              );
            })}

            <Area
              type="monotone"
              dataKey="reserve"
              stroke="#c0392b"
              strokeWidth={2.5}
              fill="url(#reserveGradient)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 5, stroke: '#c0392b', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="required"
              stroke="#007aff"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 4, stroke: '#007aff', strokeWidth: 2 }}
            />

            {/* Current hour marker */}
            {currentPoint && currentPoint.reserve !== null && (
              <ReferenceDot
                x={currentPoint.hour}
                y={currentPoint.reserve}
                r={6}
                fill="#ff3b30"
                stroke="white"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ReserveChart;
